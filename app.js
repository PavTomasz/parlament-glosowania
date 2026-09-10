const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { tab: 'sejm', latest: { sejm: [], senat: [] }, mpsLoaded: false };

const results = $('#results');
const status = $('#status');
const sectionTitle = $('#sectionTitle');
const sectionMeta = $('#sectionMeta');
const sectionKicker = $('#sectionKicker');
const input = $('#searchInput');
const modal = $('#modal');
const modalContent = $('#modalContent');

function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtDate(v) { if (!v) return ''; try { return new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeStyle:v.includes('T')?'short':undefined}).format(new Date(v)); } catch { return v; } }
function setStatus(text, type='loading') { status.textContent = text; status.className = `status ${type}`; }
function hideStatus(){ status.className='status hidden'; }
function totals(v){ return [Number(v.yes||0),Number(v.no||0),Number(v.abstain||0),Number(v.notParticipating||0)]; }
function bar(v){ const [y,n,a,o]=totals(v); const t=Math.max(1,y+n+a+o); return `<div class="bar"><i class="y" style="width:${y/t*100}%"></i><i class="n" style="width:${n/t*100}%"></i><i class="a" style="width:${a/t*100}%"></i></div>`; }
function counts(v){ return `<div class="counts"><span class="count yes"><b>${v.yes ?? '—'}</b>ZA</span><span class="count no"><b>${v.no ?? '—'}</b>PRZECIW</span><span class="count abstain"><b>${v.abstain ?? '—'}</b>WSTRZYMAŁO SIĘ</span><span class="count other"><b>${v.notParticipating ?? '—'}</b>NIE GŁOSOWAŁO</span></div>`; }
function infoItems(v){
  if (Array.isArray(v.officialInfo) && v.officialInfo.length) return v.officialInfo;
  return [['Temat', v.topic], ['Pełny tytuł', v.title], ['Decyzja / wniosek', v.decision]]
    .map(([label, value]) => ({ label, value: typeof value === 'string' ? value.trim() : '' }))
    .filter(x => x.value);
}
function renderInfo(v, compact=false){
  const items = infoItems(v);
  if (!items.length) return '';
  const visible = compact ? items.filter(x => x.value !== (v.topic || v.title || '').trim()) : items;
  if (!visible.length) return '';
  return `<dl class="official-info${compact ? ' compact' : ''}">${visible.map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('')}</dl>`;
}

function renderVotes(votes, chamber){
  if (!votes.length) { results.innerHTML='<div class="status">Brak wyników do pokazania.</div>'; return; }
  results.innerHTML = votes.map(v => {
    const title = v.topic || v.title || `Głosowanie nr ${v.votingNumber}`;
    const id = chamber === 'sejm' ? `POSIEDZENIE ${v.sitting} • GŁOSOWANIE ${v.votingNumber}` : `${v.meetingTitle ? esc(v.meetingTitle.replace(/^Posiedzenie:\s*/i,''))+' • ' : ''}GŁOSOWANIE ${v.votingNumber}`;
    return `<article class="vote-card" data-chamber="${chamber}" data-sitting="${v.sitting||''}" data-vote="${v.votingNumber||''}" data-url="${esc(v.detailUrl||'')}">
      <div class="vote-top"><span class="vote-id">${id}</span><span class="vote-date">${fmtDate(v.date || '')}</span></div>
      <h3>${esc(title)}</h3>${renderInfo(v, true)}${counts(v)}${bar(v)}
    </article>`;
  }).join('');
  $$('.vote-card').forEach(card => card.addEventListener('click', () => openVote(card)));
}

async function api(url, opts){ const r=await fetch(url,opts); const d=await r.json().catch(()=>({})); if(!r.ok||d.ok===false) throw new Error(d.error||`HTTP ${r.status}`); return d; }

async function loadSejm(){
  state.tab='sejm'; setStatus('Pobieram najnowsze głosowania z oficjalnego API Sejmu…');
  sectionKicker.textContent='NAJNOWSZE'; sectionTitle.textContent='Głosowania Sejmu';
  try { const d=await api('/api/sejm?action=latest'); state.latest.sejm=d.votes||[]; sectionMeta.textContent=d.proceeding?`Posiedzenie nr ${d.proceeding} • dane automatyczne`:'Dane automatyczne'; renderVotes(state.latest.sejm,'sejm'); hideStatus(); }
  catch(e){ setStatus(`Nie udało się pobrać danych Sejmu: ${e.message}`,'error'); results.innerHTML=''; }
}

async function loadSenat(){
  state.tab='senat'; setStatus('Pobieram najnowsze wyniki z oficjalnych stron Senatu…');
  sectionKicker.textContent='NAJNOWSZE'; sectionTitle.textContent='Głosowania Senatu';
  try { const d=await api('/api/senat?action=latest'); state.latest.senat=d.votes||[]; sectionMeta.textContent=(d.meeting||'Najnowsze posiedzenie')+' • automatyczny import'; renderVotes(state.latest.senat,'senat'); hideStatus(); }
  catch(e){ setStatus(`Nie udało się pobrać danych Senatu: ${e.message}`,'error'); results.innerHTML=''; }
}

async function loadMPs(q=''){
  state.tab='mps'; sectionKicker.textContent='POSŁOWIE'; sectionTitle.textContent=q?`Wyniki dla „${q}”`:'Posłowie obecnej kadencji'; sectionMeta.textContent='Dane z oficjalnego API Sejmu';
  setStatus('Pobieram listę posłów…');
  try { const d=await api(`/api/sejm?action=mps&q=${encodeURIComponent(q)}`); hideStatus(); results.innerHTML=`<div class="mp-grid">${(d.mps||[]).map(mp=>`<div class="mp-card" data-id="${mp.id}"><strong>${esc(mp.firstName)} ${esc(mp.lastName)}</strong><small>${esc(mp.club||'')}</small></div>`).join('')}</div>`; $$('.mp-card').forEach(x=>x.addEventListener('click',()=>openMP(x.dataset.id))); }
  catch(e){ setStatus(`Błąd: ${e.message}`,'error'); }
}

async function search(){
  const q=input.value.trim(); if(q.length<2){ input.focus(); return; }
  if(state.tab==='mps'){ return loadMPs(q); }
  if(state.tab==='senat'){
    sectionKicker.textContent='FILTR'; sectionTitle.textContent=`Senat: „${q}”`; sectionMeta.textContent='Filtrowanie najnowszego pobranego posiedzenia Senatu';
    const n=q.toLocaleLowerCase('pl'); const filtered=state.latest.senat.filter(v=>(v.topic||v.title||'').toLocaleLowerCase('pl').includes(n)); renderVotes(filtered,'senat'); hideStatus(); return;
  }
  sectionKicker.textContent='WYSZUKIWARKA'; sectionTitle.textContent=`Sejm: „${q}”`; sectionMeta.textContent='Wyniki z oficjalnej wyszukiwarki API Sejmu'; setStatus('Szukam w oficjalnych danych Sejmu…');
  try { const d=await api(`/api/sejm?action=search&q=${encodeURIComponent(q)}`); renderVotes(d.votes||[],'sejm'); hideStatus(); }
  catch(e){ setStatus(`Błąd wyszukiwania: ${e.message}`,'error'); results.innerHTML=''; }
}

async function openVote(card){
  modalContent.innerHTML='<div class="modal-inner"><div class="status loading">Pobieram szczegóły głosowania…</div></div>'; modal.showModal();
  try {
    let d;
    if(card.dataset.chamber==='sejm') d=(await api(`/api/sejm?action=detail&sitting=${card.dataset.sitting}&vote=${card.dataset.vote}`)).data;
    else d=(await api(`/api/senat?action=detail&url=${encodeURIComponent(card.dataset.url)}`)).data;
    renderDetail(d,card.dataset.chamber);
  } catch(e){ modalContent.innerHTML=`<div class="modal-inner"><div class="status error">${esc(e.message)}</div></div>`; }
}

function renderDetail(d,chamber){
  const title=d.topic||d.title||'Głosowanie'; const src=d.sourceUrl || (chamber==='sejm'?`https://api.sejm.gov.pl/sejm/term10/votings/${d.sitting}/${d.votingNumber}`:'https://www.senat.gov.pl');
  let tables='';
  if(chamber==='sejm'){
    tables += `<h3>Jak głosowały kluby</h3><table class="data-table"><thead><tr><th>Klub</th><th>Za</th><th>Przeciw</th><th>Wstrz.</th><th>Inne</th></tr></thead><tbody>${(d.clubSummary||[]).map(c=>`<tr><td>${esc(c.club)}</td><td>${c.yes}</td><td>${c.no}</td><td>${c.abstain}</td><td>${c.other}</td></tr>`).join('')}</tbody></table>`;
    tables += `<h3>Głosy posłów</h3><table class="data-table"><thead><tr><th>Poseł</th><th>Klub</th><th>Głos</th></tr></thead><tbody>${(d.votes||[]).map(v=>`<tr><td>${esc(v.firstName)} ${esc(v.lastName)}</td><td>${esc(v.club||'')}</td><td><span class="pill ${esc(v.vote)}">${esc(v.voteLabel||v.vote)}</span></td></tr>`).join('')}</tbody></table>`;
  } else if(d.clubs?.length){ tables += `<h3>Jak głosowały kluby i koła</h3><table class="data-table"><thead><tr><th>Klub / koło</th><th>Za</th><th>Przeciw</th><th>Wstrz.</th><th>Nie gł.</th></tr></thead><tbody>${d.clubs.map(c=>`<tr><td>${esc(c.club)}</td><td>${c.yes}</td><td>${c.no}</td><td>${c.abstain}</td><td>${c.notVoting}</td></tr>`).join('')}</tbody></table>`; }
  modalContent.innerHTML=`<div class="modal-inner"><div class="kicker">${chamber==='sejm'?'SEJM RP':'SENAT RP'} • GŁOSOWANIE ${d.votingNumber||''}</div><h2>${esc(title)}</h2>${renderInfo(d)}<div class="modal-sub">${esc(fmtDate(d.date||''))}${d.time?' • '+esc(d.time):''}</div><div class="big-counts"><div class="big-count yes"><b>${d.yes??'—'}</b><span>ZA</span></div><div class="big-count no"><b>${d.no??'—'}</b><span>PRZECIW</span></div><div class="big-count abstain"><b>${d.abstain??'—'}</b><span>WSTRZYMAŁO SIĘ</span></div><div class="big-count"><b>${d.notParticipating??'—'}</b><span>NIE GŁOSOWAŁO</span></div></div>${tables}<a class="source-link" href="${esc(src)}" target="_blank" rel="noopener">Otwórz oficjalne źródło ↗</a></div>`;
}

async function openMP(id){
  modalContent.innerHTML='<div class="modal-inner"><div class="status loading">Pobieram profil posła…</div></div>'; modal.showModal();
  try {
    const d=await api(`/api/sejm?action=mp&id=${id}`); const m=d.mp,t=d.totals,p=d.profile||{},all=d.allTotals||t;
    const details = [
      ['Klub parlamentarny', p.club], ['Partia', p.party], ['Okręg', p.district],
      ['Województwo', p.voivodeship], ['Zawód', p.profession], ['Wykształcenie', p.education],
      ['Data urodzenia', p.birthDate], ['Miejsce urodzenia', p.birthPlace],
      ['Głosów w wyborach', p.votes], ['Pozycja na liście', p.seat]
    ].filter(([,value]) => value !== null && value !== undefined && String(value).trim());
    const contact = [['E-mail', p.email], ['Telefon biura', p.phone], ['Strona WWW', p.website]].filter(([,value]) => value);
    const photo = p.photo ? `<img class="mp-photo" src="${esc(p.photo)}" alt="Zdjęcie ${esc(m.firstName)} ${esc(m.lastName)}" onerror="this.remove()">` : `<div class="mp-photo mp-photo-fallback">${esc((m.firstName||'')[0]||'')}${esc((m.lastName||'')[0]||'')}</div>`;
    const history = (d.history||[]).length ? `<h3>Historia kadencji — kliknij, aby otworzyć</h3><table class="data-table"><thead><tr><th>Kadencja</th><th>Lata</th><th>Klub / partia</th><th>Głosowania</th><th>Frekwencja</th></tr></thead><tbody>${d.history.map(h=>`<tr class="term-row" data-term="${h.term}" data-id="${h.mpId}" data-current-id="${id}"><td><button class="term-open">${esc(h.label)} ↗</button></td><td>${esc(h.years)}</td><td>${esc(h.club||h.party||'—')}</td><td>${h.totals?.votings ?? '—'}</td><td>${h.totals?.attendance ?? '—'}%</td></tr>`).join('')}</tbody></table>` : `<p class="modal-sub">Brak odnalezionych wcześniejszych rekordów w publicznym API Sejmu.</p>`;
    const socials = (p.social||[]).length ? `<h3>Oficjalne profile społecznościowe</h3><div class="social-links">${p.social.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}</div>` : '';
    modalContent.innerHTML=`<div class="modal-inner"><div class="mp-hero">${photo}<div><div class="kicker">POSEŁ • SEJM RP</div><h2>${esc(m.firstName)} ${esc(m.lastName)}</h2><div class="modal-sub">${esc(p.club||m.club||'')} ${p.district?'• '+esc(p.district):''}</div></div></div>${details.length?`<dl class="official-info">${details.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}${contact.length?`<h3>Kontakt publiczny</h3><dl class="official-info">${contact.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${label==='Strona WWW'?`<a class="profile-link" href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a>`:esc(value)}</dd></div>`).join('')}</dl>`:''}${socials}<h3>Bieżąca kadencja</h3><div class="big-counts"><div class="big-count"><b>${t.votings}</b><span>GŁOSOWAŃ</span></div><div class="big-count yes"><b>${t.voted}</b><span>ODDANE GŁOSY</span></div><div class="big-count no"><b>${t.missed}</b><span>OPUSZCZONE</span></div><div class="big-count abstain"><b>${t.attendance??'—'}%</b><span>FREKWENCJA</span></div></div><h3>Cała historia w Sejmie</h3><div class="big-counts"><div class="big-count"><b>${all.votings}</b><span>GŁOSOWAŃ ŁĄCZNIE</span></div><div class="big-count yes"><b>${all.voted}</b><span>ODDANE GŁOSY</span></div><div class="big-count no"><b>${all.missed}</b><span>OPUSZCZONE</span></div><div class="big-count abstain"><b>${all.attendance??'—'}%</b><span>FREKWENCJA ŁĄCZNIE</span></div></div>${history}<a class="source-link" href="https://api.sejm.gov.pl/sejm/term10/MP/${id}" target="_blank" rel="noopener">Otwórz oficjalny rekord posła ↗</a></div>`;
    $$('.term-row').forEach(row => row.addEventListener('click', () => openMPTerm(row.dataset.term, row.dataset.id, row.dataset.currentId)));
  }
  catch(e){ modalContent.innerHTML=`<div class="modal-inner"><div class="status error">${esc(e.message)}</div></div>`; }
}

async function openMPTerm(term, id, currentId){
  modalContent.innerHTML='<div class="modal-inner"><div class="status loading">Pobieram dane wybranej kadencji…</div></div>';
  try {
    const d=await api(`/api/sejm?action=mpTerm&term=${encodeURIComponent(term)}&id=${encodeURIComponent(id)}`);
    const m=d.mp,p=d.profile||{},t=d.totals||{};
    const votes=(d.votings||[]).map(v=>`<tr><td>${esc(fmtDate(v.date||''))}</td><td>${esc(v.sitting||v.proceeding||'—')}</td><td>${esc(v.votingNumber||v.number||'—')}</td><td>${esc(v.voteLabel||v.vote||'—')}</td><td>${esc(v.title||v.topic||'—')}</td></tr>`).join('');
    modalContent.innerHTML=`<div class="modal-inner"><button class="back-button" id="termBack">← Wróć do pełnego profilu</button><div class="kicker">${esc(d.term.label)} • ${esc(d.term.years)}</div><h2>${esc(m.firstName)} ${esc(m.lastName)}</h2><div class="modal-sub">${esc(p.club||m.club||'')} ${p.district?'• '+esc(p.district):''}</div><div class="big-counts"><div class="big-count"><b>${t.votings??'—'}</b><span>GŁOSOWAŃ</span></div><div class="big-count yes"><b>${t.voted??'—'}</b><span>ODDANE GŁOSY</span></div><div class="big-count no"><b>${t.missed??'—'}</b><span>OPUSZCZONE</span></div><div class="big-count abstain"><b>${t.attendance??'—'}%</b><span>FREKWENCJA</span></div></div><h3>Głosowania w tej kadencji</h3>${votes?`<table class="data-table"><thead><tr><th>Data</th><th>Posiedzenie</th><th>Głos.</th><th>Głos posła</th><th>Temat</th></tr></thead><tbody>${votes}</tbody></table>`:`<p class="modal-sub">Oficjalne API nie zwróciło indywidualnej listy głosowań dla tej kadencji.</p>`}</div>`;
    $('#termBack').addEventListener('click',()=>openMP(currentId));
  } catch(e){ modalContent.innerHTML=`<div class="modal-inner"><div class="status error">${esc(e.message)}</div></div>`; }
}

async function askAI(){
  const q=input.value.trim(); if(q.length<3){input.placeholder='Wpisz pytanie, np. Jak głosowano w sprawie Ukrainy?';input.focus();return;}
  modalContent.innerHTML='<div class="modal-inner"><div class="kicker">ZAPYTAJ AI • SEJM</div><h2>Analizuję oficjalne dane…</h2><div class="status loading">AI najpierw wyszukuje głosowania, a dopiero potem odpowiada.</div></div>'; modal.showModal();
  try { const d=await api('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})}); modalContent.innerHTML=`<div class="modal-inner"><div class="kicker">ODPOWIEDŹ AI • NA PODSTAWIE API SEJMU</div><h2>${esc(q)}</h2><div class="ai-note">AI nie jest źródłem wyniku głosowania. Odpowiedź jest generowana na podstawie rekordów pobranych z oficjalnego API Sejmu.</div><div class="ai-answer">${esc(d.answer)}</div>${d.evidence?.length?`<h3>Użyte rekordy</h3><table class="data-table"><thead><tr><th>Data</th><th>Pos.</th><th>Głos.</th><th>Temat</th></tr></thead><tbody>${d.evidence.map(e=>`<tr><td>${esc(fmtDate(e.date||''))}</td><td>${e.sitting||'—'}</td><td>${e.votingNumber||'—'}</td><td>${esc(e.topic||'')}</td></tr>`).join('')}</tbody></table>`:''}</div>`; }
  catch(e){ modalContent.innerHTML=`<div class="modal-inner"><div class="kicker">ZAPYTAJ AI</div><h2>AI nie jest jeszcze aktywne</h2><div class="status error">${esc(e.message)}</div><p class="modal-sub">Zwykła wyszukiwarka i wszystkie wyniki działają bez AI. Instrukcja w pliku START-TUTAJ.txt pokazuje, jak dodać klucz AI w Vercel.</p></div>`; }
}

$$('.tab').forEach(t=>t.addEventListener('click',()=>{ $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); const tab=t.dataset.tab; input.value=''; if(tab==='sejm')loadSejm(); else if(tab==='senat')loadSenat(); else loadMPs(); }));
$('#searchBtn').addEventListener('click',search); $('#aiBtn').addEventListener('click',askAI); $('#refreshBtn').addEventListener('click',()=>state.tab==='sejm'?loadSejm():state.tab==='senat'?loadSenat():loadMPs(input.value.trim()));
input.addEventListener('keydown',e=>{if(e.key==='Enter')search();}); $$('.examples button').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.q;search();})); $('#modalClose').addEventListener('click',()=>modal.close()); modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
loadSejm();
