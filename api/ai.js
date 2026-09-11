import { requireAccess } from '../lib/auth.js';
const SEJM = 'https://api.sejm.gov.pl/sejm/term10';
const OPENAI_URL = 'https://api.openai.com/v1/responses';

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Źródło danych: HTTP ${r.status}`);
  return r.json();
}

async function askOpenAI(input, instructions) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('AI_NOT_CONFIGURED');
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input, instructions, store: false })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI: HTTP ${r.status}`);
  const text = (data.output || [])
    .flatMap(x => x.content || [])
    .filter(x => x.type === 'output_text')
    .map(x => x.text)
    .join('\n')
    .trim();
  return text;
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return {};
}

function findMP(mps, name) {
  const needle = String(name || '').toLocaleLowerCase('pl').trim();
  if (!needle) return null;
  const exactLast = mps.find(mp => String(mp.lastName || '').toLocaleLowerCase('pl') === needle);
  if (exactLast) return exactLast;
  return mps.find(mp => `${mp.firstName || ''} ${mp.lastName || ''}`.toLocaleLowerCase('pl').includes(needle));
}

export default async function handler(req, res) {
  if (!await requireAccess(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Użyj POST.' });
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        ok: false,
        code: 'AI_NOT_CONFIGURED',
        error: 'Moduł AI nie ma jeszcze klucza OPENAI_API_KEY. Zwykła wyszukiwarka działa bez niego.'
      });
    }

    const question = String(req.body?.question || '').trim();
    if (question.length < 3 || question.length > 500) return res.status(400).json({ ok: false, error: 'Pytanie powinno mieć 3–500 znaków.' });

    const extraction = await askOpenAI(
      question,
      `Jesteś parserem zapytań do oficjalnych danych głosowań polskiego Sejmu. Zwróć WYŁĄCZNIE JSON: {"phrase":"krótka fraza do wyszukania w tytule głosowania","person":"imię/nazwisko posła albo pusty string"}. Nie odpowiadaj na pytanie. Fraza ma zawierać najważniejszy temat, bez słów typu "głosował", "Sejm", "poseł".`
    );
    const parsed = parseJsonLoose(extraction);
    const phrase = String(parsed.phrase || question).trim().slice(0, 120);
    const person = String(parsed.person || '').trim().slice(0, 100);

    let results = await json(`${SEJM}/votings/search?title=${encodeURIComponent(phrase)}`);
    results = (results || []).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    let mp = null;
    let evidence = [];
    if (person) {
      const mps = await json(`${SEJM}/MP`);
      mp = findMP(mps, person);
    }

    if (mp && results.length) {
      const details = await Promise.all(results.slice(0, 8).map(v => json(`${SEJM}/votings/${v.sitting}/${v.votingNumber}`).catch(() => null)));
      evidence = details.filter(Boolean).map(d => {
        const pv = (d.votes || []).find(v => Number(v.MP) === Number(mp.id || mp.leg || mp.MP));
        return {
          date: d.date,
          sitting: d.sitting,
          votingNumber: d.votingNumber,
          topic: d.topic || d.title,
          result: { yes: d.yes, no: d.no, abstain: d.abstain, notParticipating: d.notParticipating },
          person: mp ? `${mp.firstName} ${mp.lastName}` : null,
          personVote: pv?.vote || null
        };
      });
    } else {
      evidence = results.map(v => ({
        date: v.date,
        sitting: v.sitting,
        votingNumber: v.votingNumber,
        topic: v.topic || v.title,
        result: { yes: v.yes, no: v.no, abstain: v.abstain, notParticipating: v.notParticipating }
      }));
    }

    if (!evidence.length) {
      return res.status(200).json({
        ok: true,
        answer: `Nie znalazłem w oficjalnym API Sejmu głosowań pasujących do frazy „${phrase}”. Spróbuj krótszego hasła, np. „Ukraina”, „podatek”, „aborcja” albo nazwiska posła.`,
        evidence: []
      });
    }

    const answer = await askOpenAI(
      `PYTANIE UŻYTKOWNIKA:\n${question}\n\nOFICJALNE DANE SEJMU (JSON):\n${JSON.stringify(evidence)}`,
      `Odpowiadasz po polsku na podstawie WYŁĄCZNIE przekazanych oficjalnych danych Sejmu. Nie zgaduj i nie dopowiadaj faktów. Jeśli dane nie wystarczają, powiedz to wprost. Podaj konkretną datę, numer posiedzenia i numer głosowania przy kluczowych twierdzeniach. Wyjaśniaj prostym językiem. Maksymalnie 180 słów.`
    );

    return res.status(200).json({ ok: true, answer, evidence, parsed: { phrase, person, matchedMP: mp ? `${mp.firstName} ${mp.lastName}` : null } });
  } catch (error) {
    const msg = error.message === 'AI_NOT_CONFIGURED' ? 'Moduł AI nie jest skonfigurowany.' : (error.message || 'Błąd modułu AI.');
    return res.status(500).json({ ok: false, error: msg });
  }
}
