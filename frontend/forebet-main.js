
const $ = id => document.getElementById(id);
async function fetchJson(url){ try{ const r = await fetch(url); if(!r.ok) return {ok:false, status:r.status, text: await r.text()}; return {ok:true, json: await r.json()}; } catch(err){ return {ok:false, error:String(err)}; } }

function createPredictHTML(pred){
  if(!pred) return '<div class="small">Sin datos</div>';
  const winner = pred.predicted_winner;
  const ph = pred.probabilities.home_pct;
  const pd = pred.probabilities.draw_pct;
  const pa = pred.probabilities.away_pct;
  return `<div style="display:flex;flex-direction:column;gap:6px"><div><strong>${winner}</strong></div><div class="small">Local ${ph}% — Empate ${pd}% — Visita ${pa}%</div><div style="font-size:12px;color:var(--muted)">xG: ${pred.expected_goals.home} - ${pred.expected_goals.away}</div></div>`;
}

function renderMatches(matches){
  const container = $('matches-list'); container.innerHTML = '';
  if(!matches || matches.length===0){ container.innerHTML = '<div class="small">No hay partidos</div>'; return; }
  matches.forEach(async (m)=>{
    const date = m.date ? new Date(m.date).toLocaleString() : '';
    const home = m.home_team || 'HOME'; const away = m.away_team || 'AWAY';
    const div = document.createElement('div'); div.className='match-row';
    // placeholder for prediction
    const predDiv = document.createElement('div'); predDiv.innerHTML = '<div class="small">Cargando...</div>';
    // details button
    const btn = document.createElement('button'); btn.textContent='Detalles'; btn.onclick = ()=>openMatchDetails(m);
    div.innerHTML = `<div class="small">${date}</div><div class="teams"><div><strong>${home}</strong> vs <strong>${away}</strong></div><div class="team-stats" id="stats-${m.id}"></div></div>`;
    div.appendChild(predDiv);
    const detailsBtn = document.createElement('div'); detailsBtn.appendChild(btn); div.querySelector('.teams').appendChild(detailsBtn);
    container.appendChild(div);
    // fetch prediction and render in predDiv; also populate small stats area
    const pred = await fetchJson('/match/'+m.id+'/predict');
    if(pred.ok && pred.json){
      predDiv.innerHTML = createPredictHTML(pred.json);
      const statsEl = document.getElementById('stats-'+m.id);
      if(statsEl){
        const hs = pred.json.home_stats; const as = pred.json.away_stats;
        statsEl.innerHTML = `<div>${hs.played} PJ · W${hs.wins}-D${hs.draws}-L${hs.losses} · GF ${hs.avg_gf} GA ${hs.avg_ga}</div><div>${as.played} PJ · W${as.wins}-D${as.draws}-L${as.losses} · GF ${as.avg_gf} GA ${as.avg_ga}</div>`;
      }
      // push to top picks if strong probability
      if(pred.json.probabilities.home_pct>=70 || pred.json.probabilities.away_pct>=70){
        addTopPick(pred.json);
      }
    } else {
      predDiv.innerHTML = '<div class="small">Error predicción</div>';
    }
  });
}

function addTopPick(pred){
  const box = $('top-picks-list');
  const div = document.createElement('div'); div.className='pick';
  const winner = pred.predicted_winner;
  const pct = Math.max(pred.probabilities.home_pct, pred.probabilities.away_pct, pred.probabilities.draw_pct);
  div.innerHTML = `<div>${pred.home} vs ${pred.away} — <strong>${winner}</strong></div><div class="perc">${pct}%</div>`;
  box.appendChild(div);
}

async function loadLeagues(){
  const r = await fetchJson('/leagues');
  if(r.ok && r.json){ const sel=$('league-select'); sel.innerHTML=''; r.json.forEach(l=>{ const opt=document.createElement('option'); opt.value=l.id; opt.textContent=l.name; sel.appendChild(opt); }); return r.json; }
  const local = await fetchJson('/leagues.json');
  if(local.ok && local.json){ const sel=$('league-select'); sel.innerHTML=''; local.json.forEach(l=>{ const opt=document.createElement('option'); opt.value=l.id; opt.textContent=l.name; sel.appendChild(opt); }); return local.json; }
  return [];
}

async function loadMatchesForLeague(id){
  const r = await fetchJson('/league/'+id+'/matches');
  if(r.ok && r.json){ renderMatches(r.json); return r.json; }
  const local = await fetchJson('/matches.json');
  if(local.ok && local.json && local.json[id]){ renderMatches(local.json[id]); return local.json[id]; }
  renderMatches([]); return [];
}

async function loadTeamsForLeague(id){
  const r = await fetchJson('/league/'+id+'/teams');
  if(r.ok && r.json){ renderTeams(r.json); return r.json; }
  const local = await fetchJson('/teams.json');
  if(local.ok && local.json && local.json[id]){ renderTeams(local.json[id]); return local.json[id]; }
  renderTeams([]); return [];
}

function renderTeams(list){ const ul=$('teams-list'); ul.innerHTML=''; if(!list) return; list.forEach(t=>{ const li=document.createElement('li'); li.textContent = t.name || t; ul.appendChild(li); }); }

async function openMatchDetails(match){
  const modal = $('modal'); const body=$('modal-body'); modal.classList.remove('hidden'); body.innerHTML = '<div class="small">Cargando...</div>';
  try{
    const pred = await fetchJson('/match/'+match.id+'/predict');
    if(!pred.ok){ body.innerHTML = '<div class="small">Error cargando detalles</div>'; return; }
    const p = pred.json;
    let html = `<h3>${p.home} vs ${p.away}</h3><div class="small">Predicción: <strong>${p.predicted_winner}</strong> — Local ${p.probabilities.home_pct}% Empate ${p.probabilities.draw_pct}% Visita ${p.probabilities.away_pct}%</div>`;
    html += '<h4>Estadísticas — Local</h4>';
    html += `<div class="recent-list">PJ:${p.home_stats.played} W:${p.home_stats.wins} D:${p.home_stats.draws} L:${p.home_stats.losses} · GF:${p.home_stats.avg_gf} GA:${p.home_stats.avg_ga}</div>`;
    html += '<h4>Estadísticas — Visita</h4>';
    html += `<div class="recent-list">PJ:${p.away_stats.played} W:${p.away_stats.wins} D:${p.away_stats.draws} L:${p.away_stats.losses} · GF:${p.away_stats.avg_gf} GA:${p.away_stats.avg_ga}</div>`;
    body.innerHTML = html;
  }catch(err){ body.innerHTML = '<div class="small">Error: '+String(err)+'</div>'; }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await loadLeagues();
  const sel=$('league-select');
  sel.addEventListener('change', async ()=>{ const id=sel.value; await loadMatchesForLeague(id); await loadTeamsForLeague(id); });
  if(sel.options.length>0){ sel.selectedIndex=0; const id=sel.value; loadMatchesForLeague(id); loadTeamsForLeague(id); }
  document.getElementById('btn-refresh').addEventListener('click', async ()=>{ const id=sel.value; await loadMatchesForLeague(id); await loadTeamsForLeague(id); });
  $('modal-close').addEventListener('click', ()=>{$('modal').classList.add('hidden');});
});