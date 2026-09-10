const BASE = 'https://api.sejm.gov.pl/sejm/term10';

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ParlamentGlosowania/1.0 (+public parliamentary data viewer)'
    }
  });
  if (!r.ok) throw new Error(`Sejm API: HTTP ${r.status}`);
  return r.json();
}

function voteLabel(vote) {
  const map = {
    YES: 'ZA', NO: 'PRZECIW', ABSTAIN: 'WSTRZYMAŁ SIĘ',
    ABSENT: 'NIE GŁOSOWAŁ', NOT_PARTICIPATING: 'NIE GŁOSOWAŁ',
    PRESENT: 'OBECNY'
  };
  return map[vote] || vote || '—';
}

function clubSummary(votes = []) {
  const clubs = new Map();
  for (const v of votes) {
    const club = v.club || 'Niezrzeszeni';
    if (!clubs.has(club)) clubs.set(club, { club, yes: 0, no: 0, abstain: 0, other: 0, total: 0 });
    const row = clubs.get(club);
    row.total++;
    if (v.vote === 'YES') row.yes++;
    else if (v.vote === 'NO') row.no++;
    else if (v.vote === 'ABSTAIN') row.abstain++;
    else row.other++;
  }
  return [...clubs.values()].sort((a, b) => b.total - a.total);
}

async function latestVotes() {
  const proceedings = await fetchJson(`${BASE}/proceedings`);
  const sorted = [...proceedings].sort((a, b) => Number(b.number) - Number(a.number));

  for (const p of sorted.slice(0, 10)) {
    try {
      const votes = await fetchJson(`${BASE}/votings/${p.number}`);
      if (Array.isArray(votes) && votes.length) {
        return {
          proceeding: p.number,
          proceedingTitle: p.title,
          votes: [...votes]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 30)
        };
      }
    } catch (_) {}
  }
  return { proceeding: null, proceedingTitle: '', votes: [] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const action = String(req.query?.action || 'latest');

    if (action === 'latest') {
      const data = await latestVotes();
      return res.status(200).json({ ok: true, source: 'Sejm RP API', ...data });
    }

    if (action === 'detail') {
      const sitting = Number(req.query?.sitting);
      const vote = Number(req.query?.vote);
      if (!sitting || !vote) return res.status(400).json({ ok: false, error: 'Brak numeru posiedzenia lub głosowania.' });
      const data = await fetchJson(`${BASE}/votings/${sitting}/${vote}`);
      return res.status(200).json({
        ok: true,
        source: 'Sejm RP API',
        data: {
          ...data,
          clubSummary: clubSummary(data.votes),
          votes: (data.votes || []).map(v => ({ ...v, voteLabel: voteLabel(v.vote) }))
        }
      });
    }

    if (action === 'search') {
      const q = String(req.query?.q || '').trim();
      if (q.length < 2) return res.status(400).json({ ok: false, error: 'Wpisz co najmniej 2 znaki.' });
      const url = `${BASE}/votings/search?title=${encodeURIComponent(q)}`;
      const data = await fetchJson(url);
      const votes = [...(data || [])]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 100);
      return res.status(200).json({ ok: true, source: 'Sejm RP API', query: q, votes });
    }

    if (action === 'mps') {
      const q = String(req.query?.q || '').trim().toLocaleLowerCase('pl');
      const mps = await fetchJson(`${BASE}/MP`);
      const filtered = (mps || []).filter(mp => {
        if (!q) return true;
        const hay = `${mp.firstName || ''} ${mp.secondName || ''} ${mp.lastName || ''} ${mp.club || ''}`.toLocaleLowerCase('pl');
        return hay.includes(q);
      }).slice(0, 80);
      return res.status(200).json({ ok: true, source: 'Sejm RP API', mps: filtered });
    }

    if (action === 'mp') {
      const id = Number(req.query?.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Brak ID posła.' });
      const [mp, stats] = await Promise.all([
        fetchJson(`${BASE}/MP/${id}`),
        fetchJson(`${BASE}/MP/${id}/votings/stats`).catch(() => [])
      ]);
      const totals = (stats || []).reduce((acc, x) => {
        acc.votings += Number(x.numVotings || 0);
        acc.voted += Number(x.numVoted || 0);
        acc.missed += Number(x.numMissed || 0);
        return acc;
      }, { votings: 0, voted: 0, missed: 0 });
      totals.attendance = totals.votings ? Math.round((totals.voted / totals.votings) * 1000) / 10 : null;
      return res.status(200).json({ ok: true, source: 'Sejm RP API', mp, totals, stats });
    }

    return res.status(400).json({ ok: false, error: 'Nieznana akcja.' });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'Błąd połączenia z API Sejmu.' });
  }
}
