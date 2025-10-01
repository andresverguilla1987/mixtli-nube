(function(){
  const API = (document.querySelector('meta[name="mixtli-api"]')?.content)||''
  const album = document.getElementById('album')
  const files = document.getElementById('files')
  const go = document.getElementById('go')
  const uploads = document.getElementById('uploads')
  const status = document.getElementById('status')
  const apiBadge = document.getElementById('apiBadge')
  apiBadge.textContent = 'Backend: ' + (API || '(no configurado)')

  const jsonOrText = async (res)=>{
    const ct = (res.headers.get('content-type')||'').toLowerCase()
    if(ct.includes('application/json')) return await res.json()
    const txt = await res.text()
    throw new Error(`HTTP ${res.status} — esperaba JSON, llegó: ${txt.slice(0,200)}`)
  }

  function progressBar(){ const wrap=document.createElement('div'); wrap.className='progress'; const fill=document.createElement('div'); wrap.appendChild(fill); return {wrap,fill} }

  async function presign(key, contentType){
    const body = JSON.stringify({key, contentType})
    const res = await fetch(API+'/api/presign', { method:'POST', headers:{'Content-Type':'application/json'}, body })
    if(!res.ok){
      const txt = await res.text().catch(()=>'');
      throw new Error(`HTTP ${res.status} al presignar — ${txt.slice(0,200)}`)
    }
    const data = await jsonOrText(res)
    if(!data?.url) throw new Error('Respuesta sin url: '+JSON.stringify(data))
    return data.url
  }

  async function complete(key){
    const res = await fetch(API+'/api/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({key}) })
    if(!res.ok){
      const txt = await res.text().catch(()=>'');
      throw new Error(`HTTP ${res.status} al completar — ${txt.slice(0,200)}`)
    }
    // try to read json but ignore errors
    try{ await res.json() }catch{}
  }

  function keyFor(album, name){ return 'albums/'+encodeURIComponent(album)+'/'+encodeURIComponent(name) }

  go.onclick = async ()=>{
    if(!API) return alert('Backend no configurado')
    const alb = (album.value||'').trim()
    if(!alb) return alert('Escribe el nombre del álbum')
    const list = Array.from(files.files || [])
    if(!list.length) return alert('Selecciona archivos')

    status.textContent = 'Subiendo '+list.length+' archivo(s)…'
    uploads.innerHTML=''

    for(const f of list){
      const row=document.createElement('div'); row.style.margin='10px 0'; row.innerHTML = '<div>'+f.name+'</div>'
      const {wrap,fill} = progressBar(); row.appendChild(wrap); uploads.appendChild(row)
      try{
        const key = keyFor(alb, f.name)
        const url = await presign(key, f.type || 'application/octet-stream')
        await fetch(url, { method:'PUT', headers:{'Content-Type': f.type || 'application/octet-stream'}, body: f })
        fill.style.width = '80%'
        await complete(key)
        fill.style.width = '100%'
      }catch(e){
        console.error(e)
        row.innerHTML += '<div class="small" style="color:#fca5a5">Error: '+(e.message||e)+'</div>'
      }
    }

    status.textContent = 'Listo. Ver álbum »'
    const a=document.createElement('a'); a.href='./album.html?id='+encodeURIComponent((album.value||'').trim()); a.textContent='Abrir álbum'
    status.appendChild(document.createTextNode(' ')); status.appendChild(a)
  }
})()
