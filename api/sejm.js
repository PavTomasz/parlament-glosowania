const BASE = 'https://api.sejm.gov.pl/sejm/term10';
const TERMS = [
  [10, 'X kadencja', '2023–2027'], [9, 'IX kadencja', '2019–2023'],
  [8, 'VIII kadencja', '2015–2019'], [7, 'VII kadencja', '2011–2015'],
  [6, 'VI kadencja', '2007–2011'], [5, 'V kadencja', '2005–2007'],
  [4, 'IV kadencja', '2001–2005'], [3, 'III kadencja', '1997–2001'],
  [2, 'II kadencja', '1993–1997'], [1, 'I kadencja', '1991–1993']
];

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

function officialInfo(data = {}) {
  const fields = [
    ['Temat', data.topic],
    ['Pełny tytuł', data.title],
    ['Przedmiot głosowania', data.subject || data.question || data.proposal],
    ['Decyzja / wniosek', data.decision],
    ['Opis', data.description],
    ['Numer druku', data.printNumber || data.documentNumber || data.document]
  ];
  const seen = new Set();
  return fields.reduce((items, [label, value]) => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const key = text.toLocaleLowerCase('pl');
    if (text && !seen.has(key)) {
      seen.add(key);
      items.push({ label, value: text });
    }
    return items;
  }, []);
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function publicUrl(...values) {
  const value = firstText(...values);
  return /^https?:\/\//i.test(value) ? value : '';
}

function publicProfile(mp = {}) {
  const contact = mp.contact || mp.contacts || {};
  const social = mp.socialMedia || mp.social || mp.socialNetworks || {};
  const photo = firstText(mp.photo, mp.photoUrl, mp.image, mp.imageUrl, mp.picture);
  return {
    photo: photo && !/^https?:/i.test(photo) ? `https://api.sejm.gov.pl${photo}` : photo,
    email: firstText(mp.email, mp.emailAddress, contact.email, contact.emailAddress),
    phone: firstText(mp.phone, mp.phoneNumber, mp.telephone, contact.phone, contact.phoneNumber),
    website: firstText(mp.website, mp.www, mp.webPage, contact.website),
    social: [
      ['Facebook', publicUrl(mp.facebook, social.facebook, contact.facebook)],
      ['X / Twitter', publicUrl(mp.twitter, mp.x, social.twitter, social.x, contact.twitter)],
      ['Instagram', publicUrl(mp.instagram, social.instagram, contact.instagram)],
      ['YouTube', publicUrl(mp.youtube, social.youtube, contact.youtube)],
      ['LinkedIn', publicUrl(mp.linkedin, social.linkedin, contact.linkedin)],
      ['TikTok', publicUrl(mp.tiktok, social.tiktok, contact.tiktok)]
    ].filter(([, url]) => url),
    club: firstText(mp.club, mp.parliamentaryGroup, mp.party),
    party: firstText(mp.party, mp.politicalParty),
    district: firstText(mp.districtName, mp.district, mp.electoralDistrict),
    voivodeship: firstText(mp.voivodeship, mp.region),
    profession: firstText(mp.profession, mp.occupation),
    education: firstText(mp.educationLevel, mp.education),
    birthDate: firstText(mp.birthDate, mp.dateOfBirth),
    birthPlace: firstText(mp.birthLocation, mp.birthPlace),
    votes: mp.numberOfVotes ?? mp.votes ?? null,
    seat: mp.numberInVotingDistrict ?? mp.position ?? null
  };
}

async function parliamentaryHistory(mp) {
  const fullName = `${mp.firstName || ''} ${mp.lastName || ''}`.trim().toLocaleLowerCase('pl');
  if (!fullName) return [];
  const lookups = await Promise.allSettled(TERMS.map(async ([term, label, years]) => {
    const members = await fetchJson(`https://api.sejm.gov.pl/sejm/term${term}/MP`);
    const found = (members || []).find(member =>
      `${member.firstName || ''} ${member.lastName || ''}`.trim().toLocaleLowerCase('pl') === fullName
    );
    if (!found) return null;
    const profile = publicProfile(found);
    return { term, label, years, club: profile.club, party: profile.party, district: profile.district };
  }));
  return lookups
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value)
    .sort((a, b) => b.term - a.term);
}

async function latestVotes() {
  const proceedings = await fetchJson(`${BASE}/proceedings`);
  const sorted = [...proceedings].sort((a, b) => Number(b.number) - Number(a.number));

  for (const p of sorted.slice(0, 10)) {
    try {
      const votes = await fetchJson(`${BASE}/votings/${p.number}`);
      if (Array.isArray(votes) && votes.length) {
        const latest = [...votes]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 12);
        const enriched = await Promise.all(latest.map(async vote => {
          try {
            const detail = await fetchJson(`${BASE}/votings/${p.number}/${vote.votingNumber}`);
            return {
              ...vote,
              decision: detail.decision || '',
              topic: detail.topic || vote.topic || vote.title || '',
              title: detail.title || vote.title || '',
              officialInfo: officialInfo(detail)
            };
          } catch (_) {
            return vote;
          }
        }));
        return {
          proceeding: p.number,
          proceedingTitle: p.title,
          votes: enriched
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
          officialInfo: officialInfo(data),
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
      });
      return res.status(200).json({ ok: true, source: 'Sejm RP API', mps: filtered });
    }

    if (action === 'mp') {
      const id = Number(req.query?.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Brak ID posła.' });
      const [mp, stats] = await Promise.all([
        fetchJson(`${BASE}/MP/${id}`),
        fetchJson(`${BASE}/MP/${id}/votings/stats`).catch(() => [])
      ]);
      const [historyResult] = await Promise.allSettled([parliamentaryHistory(mp)]);
      const totals = (stats || []).reduce((acc, x) => {
        acc.votings += Number(x.numVotings || 0);
        acc.voted += Number(x.numVoted || 0);
        acc.missed += Number(x.numMissed || 0);
        return acc;
      }, { votings: 0, voted: 0, missed: 0 });
      totals.attendance = totals.votings ? Math.round((totals.voted / totals.votings) * 1000) / 10 : null;
      return res.status(200).json({
        ok: true,
        source: 'Sejm RP API',
        mp,
        profile: publicProfile(mp),
        history: historyResult.status === 'fulfilled' ? historyResult.value : [],
        totals,
        stats
      });
    }

    return res.status(400).json({ ok: false, error: 'Nieznana akcja.' });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'Błąd połączenia z API Sejmu.' });
  }
}
