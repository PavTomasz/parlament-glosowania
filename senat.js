import * as cheerio from 'cheerio';

const BASE = 'https://www.senat.gov.pl';
const LIST = `${BASE}/prace/posiedzenia/`;

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ParlamentGlosowania/1.0; public-data-viewer)',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!r.ok) throw new Error(`Senat: HTTP ${r.status}`);
  return r.text();
}

function abs(href) {
  if (!href) return null;
  return href.startsWith('http') ? href : new URL(href, BASE).href;
}

function clean(s = '') {
  return s.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function discoverPages(html) {
  const $ = cheerio.load(html);
  const pages = [];
  $('a[href*="glosowania.html"]').each((_, a) => {
    const href = abs($(a).attr('href'));
    const m = href?.match(/przebieg,(\d+),(\d+),glosowania\.html/i);
    if (m) pages.push({ url: href, internal: Number(m[1]), day: Number(m[2]) });
  });
  const unique = [...new Map(pages.map(x => [x.url, x])).values()];
  unique.sort((a, b) => b.internal - a.internal || b.day - a.day);
  return unique;
}

function parseListPage(html, url) {
  const $ = cheerio.load(html);
  const pageTitle = clean($('h1').first().text()) || clean($('title').text());
  const dateText = clean($('h1').first().nextAll().filter((_, el) => /\d{1,2}\s+\S+\s+20\d{2}/.test(clean($(el).text()))).first().text());
  const votes = [];
  const seen = new Set();

  $('a[href*="szczegoly-glosowania"]').each((_, a) => {
    const href = abs($(a).attr('href'));
    const m = href?.match(/szczegoly-glosowania,(\d+),(\d+),(\d+)\.html/i);
    if (!m) return;
    const voteNo = Number(m[2]);
    if (seen.has(voteNo)) return;
    seen.add(voteNo);

    let block = $(a).closest('tr');
    if (!block.length) {
      let cur = $(a).parent();
      let best = cur;
      for (let i = 0; i < 6 && cur.length; i++) {
        const txt = clean(cur.text());
        if (txt.length > 25 && txt.length < 1200) best = cur;
        cur = cur.parent();
      }
      block = best;
    }
    let text = clean(block.text());
    text = text
      .replace(/imienne/gi, '')
      .replace(/kluby i koło/gi, '')
      .replace(/wersja do druku/gi, '')
      .replace(/Nr głosowania/gi, '')
      .replace(/Temat głosowania/gi, '')
      .replace(/Wyniki głosowania/gi, '');
    text = clean(text).replace(new RegExp(`^${voteNo}\\s*`), '');

    votes.push({
      votingNumber: voteNo,
      topic: text || `Głosowanie nr ${voteNo}`,
      detailUrl: href,
      sourceUrl: url
    });
  });

  return { pageTitle, dateText, votes: votes.sort((a, b) => b.votingNumber - a.votingNumber) };
}

function parseDetail(html, url) {
  const $ = cheerio.load(html);
  const headings = $('h1,h2,h3').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const body = clean($('body').text());
  const resultMatch = body.match(/Za:\s*(\d+)\s*Przeciw:\s*(\d+)\s*Wstrzymało się:\s*(\d+)\s*Nie głosowało:\s*(\d+)/i);
  const dateMatch = body.match(/Dnia\s+(\d{2}-\d{2}-\d{4})\s+godz\.\s*([0-9:]+)/i);

  let title = headings.find(h => !/^Dnia\b/i.test(h) && !/Senatorowie|Sylwetki/i.test(h)) || 'Głosowanie Senatu';
  const decision = headings.find(h => /wniosek|przyjęcie|poprawk|uchwał|odrzucenie/i.test(h) && h !== title) || '';

  const clubs = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('th,td').map((__, td) => clean($(td).text())).get();
    if (cells.length >= 7 && !/Klub\/Koło/i.test(cells[0])) {
      const nums = cells.slice(1, 7).map(x => Number((x.match(/\d+/) || [0])[0]));
      if (cells[0] && nums.some(Number.isFinite)) {
        clubs.push({
          club: cells[0], members: nums[0] || 0, voted: nums[1] || 0,
          yes: nums[2] || 0, no: nums[3] || 0, abstain: nums[4] || 0, notVoting: nums[5] || 0
        });
      }
    }
  });

  const m = url.match(/szczegoly-glosowania,(\d+),(\d+),(\d+)\.html/i);
  return {
    votingNumber: m ? Number(m[2]) : null,
    title,
    decision,
    date: dateMatch?.[1] || '',
    time: dateMatch?.[2] || '',
    yes: resultMatch ? Number(resultMatch[1]) : null,
    no: resultMatch ? Number(resultMatch[2]) : null,
    abstain: resultMatch ? Number(resultMatch[3]) : null,
    notParticipating: resultMatch ? Number(resultMatch[4]) : null,
    clubs,
    sourceUrl: url
  };
}

async function latest() {
  const indexHtml = await fetchText(LIST);
  const pages = discoverPages(indexHtml);
  if (!pages.length) throw new Error('Nie udało się znaleźć stron głosowań Senatu.');

  const maxInternal = pages[0].internal;
  const currentPages = pages.filter(p => p.internal === maxInternal).sort((a, b) => b.day - a.day);
  const parsedPages = await Promise.all(currentPages.map(async p => ({ p, parsed: parseListPage(await fetchText(p.url), p.url) })));
  const entries = parsedPages.flatMap(({ p, parsed }) => parsed.votes.map(v => ({ ...v, day: p.day, meetingTitle: parsed.pageTitle })));
  entries.sort((a, b) => b.day - a.day || b.votingNumber - a.votingNumber);

  const selected = entries.slice(0, 12);
  const enriched = await Promise.all(selected.map(async v => {
    try {
      const d = parseDetail(await fetchText(v.detailUrl), v.detailUrl);
      return { ...v, ...d, topic: d.title || v.topic };
    } catch (_) {
      return v;
    }
  }));

  return {
    meeting: parsedPages[0]?.parsed?.pageTitle || 'Najnowsze posiedzenie Senatu',
    votes: enriched
  };
}

function validDetailUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.senat.gov.pl' && u.pathname.includes('/sklad/senatorowie/szczegoly-glosowania');
  } catch { return false; }
}

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || 'latest');

    if (action === 'latest') {
      const data = await latest();
      return res.status(200).json({ ok: true, source: 'Senat RP', ...data });
    }

    if (action === 'detail') {
      const url = String(req.query?.url || '');
      if (!validDetailUrl(url)) return res.status(400).json({ ok: false, error: 'Nieprawidłowy adres źródłowy.' });
      const data = parseDetail(await fetchText(url), url);
      return res.status(200).json({ ok: true, source: 'Senat RP', data });
    }

    return res.status(400).json({ ok: false, error: 'Nieznana akcja.' });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'Błąd pobierania danych Senatu.' });
  }
}
