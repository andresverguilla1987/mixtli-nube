
const $ = id => document.getElementById(id);
async function fetchJson(url){ try{ const r = await fetch(url); if(!r.ok) return {ok:false, status:r.status, text: await r.text()}; return {ok:true, json: await r.json()}; } catch(err){ return {ok:false, error:String(err)}; } }

function renderMatches(matches){
  const container = $('matches-list'); container.innerHTML = '';
  if(!matches || matches.length===0){ container.innerHTML = '<div class="small">No hay partidos</div>'; return; }
  matches.forEach(m=>{
    const date = m.date ? new Date(m.date).toLocaleString() : '';
    const home = m.home_team || 'HOME';
    const away = m.away_team || 'AWAY';
    const div = document.createElement('div'); div.className='match-row';
    const btn = document.createElement('button'); btn.textContent='Detalles'; btn.onclick = ()=>openMatchDetails(m);
    div.innerHTML = `<div class="small">${date}</div><div class="teams">${home} vs ${away}</div><div class="perc">—</div>`;
    div.querySelector('.perc').appendChild(btn);
    container.appendChild(div);
  });
}

function renderTopPicks(picks){ const box = $('top-picks-list'); box.innerHTML=''; if(!picks || picks.length===0){ box.innerHTML='<div class="small">Sin picks</div>'; return;} picks.forEach((p,i)=>{ const div=document.createElement('div'); div.className='pick'; div.innerHTML=`<div>#${i+1} ${p.home} vs ${p.away}</div><div class="perc">${p.prob_home}%</div>`; box.appendChild(div); }); }

function renderTeams(list){ const ul = $('teams-list'); ul.innerHTML=''; if(!list || list.length===0){ ul.innerHTML='<li class="small">Sin equipos</li>'; return; } list.forEach(t=>{ const li=document.createElement('li'); li.textContent = t.name || t; ul.appendChild(li); }); }

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

async function openMatchDetails(match){
  // show modal and fetch recent for both teams and match detail
  const modal = $('modal'); const body = $('modal-body'); modal.classList.remove('hidden'); body.innerHTML = '<div class="small">Cargando...</div>';
  try{
    const [mRes, homeRes, awayRes, standingsRes] = await Promise.all([
      fetchJson('/match/'+match.id),
      match.home_team_id ? fetchJson('/team/'+match.home_team_id+'/recent') : Promise.resolve({ok:false}),
      match.away_team_id ? fetchJson('/team/'+match.away_team_id+'/recent') : Promise.resolve({ok:false}),
      match.competition ? fetchJson('/competition/'+match.competition_id+'/standings') : Promise.resolve({ok:false})
    ]);
    let html = `<h3>${match.home_team} vs ${match.away_team}</h3>`;
    if(mRes.ok && mRes.json){ const md = mRes.json; html += `<div class="small">Status: ${md.status || md.match?.status || ''}</div>`; }
    if(homeRes.ok && homeRes.json){
      html += '<h4>Últimos partidos — ' + match.home_team + '</h4><div class="recent-list">';
      homeRes.json.forEach(r=> html += `<div>${new Date(r.date).toLocaleDateString()} — ${r.homeTeam} ${r.score?.fullTime?.home ?? '-'} : ${r.score?.fullTime?.away ?? '-'} vs ${r.awayTeam}</div>`);
      html += '</div>';
    }
    if(awayRes.ok && awayRes.json){
      html += '<h4>Últimos partidos — ' + match.away_team + '</h4><div class="recent-list">';
      awayRes.json.forEach(r=> html += `<div>${new Date(r.date).toLocaleDateString()} — ${r.homeTeam} ${r.score?.fullTime?.home ?? '-'} : ${r.score?.fullTime?.away ?? '-'} vs ${r.awayTeam}</div>`);
      html += '</div>';
    }
    // simple head-to-head: fetch recent and filter where both teams involved
    // (for now, search in home+away recent arrays)
    let h2h = [];
    if(homeRes.ok && homeRes.json && awayRes.ok && awayRes.json){
      const combined = homeRes.json.concat(awayRes.json);
      const names = [match.home_team, match.away_team];
      combined.forEach(it=>{
        if((it.homeTeam===names[0] && it.awayTeam===names[1]) || (it.homeTeam===names[1] && it.awayTeam===names[0])) h2h.push(it);
      });
    }
    if(h2h.length>0){
      html += '<h4>Head-to-head</h4><div class="recent-list">';
      h2h.forEach(r=> html += `<div>${new Date(r.date).toLocaleDateString()} — ${r.homeTeam} ${r.score?.fullTime?.home ?? '-'} : ${r.score?.fullTime?.away ?? '-'} ${r.awayTeam}</div>`);
      html += '</div>';
    }
    body.innerHTML = html;
  }catch(err){
    body.innerHTML = '<div class="small">Error cargando detalles: '+String(err)+'</div>';
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await loadLeagues();
  const sel = $('league-select');
  sel.addEventListener('change', async ()=>{
    const id = sel.value;
    await loadMatchesForLeague(id);
    await loadTeamsForLeague(id);
  });
  if(sel.options.length>0){ sel.selectedIndex=0; const id=sel.value; loadMatchesForLeague(id); loadTeamsForLeague(id); }
  document.getElementById('btn-refresh').addEventListener('click', async ()=>{ const id = sel.value; await loadMatchesForLeague(id); await loadTeamsForLeague(id); });
  $('modal-close').addEventListener('click', ()=>{ $('modal').classList.add('hidden'); });
});