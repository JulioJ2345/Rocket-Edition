'use strict';
const KEY='rocket-box-v1';
const initial=()=>({version:1,game:'Pokémon Team Rocket Edition',difficulty:'Normal',maxLives:3,levelCap:7,pokemon:[],zones:[],spriteCache:{}});
let db;try{db=JSON.parse(localStorage.getItem(KEY))||initial()}catch{db=initial()};db={...initial(),...db};
let tab='team',editing=null,zoneEditing=null,installPrompt=null;
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch{toast('Almacenamiento lleno: exporta una copia de seguridad')}};
const toast=s=>{const t=$('toast');t.textContent=s;t.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.style.display='none',2600)};
const hearts=n=>'<span class="hearts">'+[0,1,2].map(i=>i<Number(n)?'♥':'<span class="off">♡</span>').join('')+'</span>';
const fallback=p=>'<div class="spritefallback">'+esc((p.species||'?').slice(0,1).toUpperCase())+'</div>';
// Sprites locales en IndexedDB: no ocupan el límite pequeño de localStorage.
const SPRITEDB='rocket-box-sprites-v2';
let spriteDBPromise;
function spriteDB(){return spriteDBPromise ||= new Promise((resolve,reject)=>{const req=indexedDB.open(SPRITEDB,1);req.onupgradeneeded=()=>req.result.createObjectStore('images');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function spritePut(key,blob){const dbi=await spriteDB();return new Promise((resolve,reject)=>{const tx=dbi.transaction('images','readwrite');tx.objectStore('images').put(blob,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function spriteGet(key){const dbi=await spriteDB();return new Promise((resolve,reject)=>{const req=dbi.transaction('images','readonly').objectStore('images').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
const spriteURLs=new Map();
// Pixel art oficial de PokeAPI. Las imágenes se solicitan al mostrarse;
// el service worker guarda las visitadas para uso posterior sin conexión.
const SPRITE_ROOT='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const POKEAPI_ROOT='https://pokeapi.co/api/v2/pokemon/';
const pendingDex=new Map();
function normalizedSpecies(name){return String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/♀/g,'-f').replace(/♂/g,'-m').replace(/[^a-z0-9 -]/g,'').replace(/ +/g,'-')}
async function resolveDex(p){
  if(p.dex)return Number(p.dex);
  const name=normalizedSpecies(p.species);
  if(!name)return null;
  if(!pendingDex.has(name))pendingDex.set(name,(async()=>{
    try{
      const response=await fetch(POKEAPI_ROOT+encodeURIComponent(name));
      if(!response.ok)return null;
      const data=await response.json();
      if(!Number.isInteger(data.id)||data.id<1)return null;
      db.pokemon.filter(x=>normalizedSpecies(x.species)===name&&!x.dex).forEach(x=>x.dex=data.id);
      save();
      return data.id;
    }catch{return null}
  })());
  return pendingDex.get(name);
}
async function updateSprite(img){
  const id=img.dataset.pokeid;
  const p=db.pokemon.find(x=>String(x.id)===id);
  if(!p)return;
  // Un sprite personal siempre prevalece sobre el oficial.
  if(p.customSprite){
    try{const blob=await spriteGet('custom:'+id);if(blob){const key='custom:'+id;if(!spriteURLs.has(key))spriteURLs.set(key,URL.createObjectURL(blob));if(img.isConnected)img.src=spriteURLs.get(key);return}}catch(e){console.warn('Sprite personalizado',e)}
  }
  let dex=Number(p.dex)||null;
  if(!dex)dex=await resolveDex(p);
  if(!dex||!img.isConnected)return;
  try{const blob=await spriteGet('dex:'+dex);if(blob){const key='dex:'+dex;if(!spriteURLs.has(key))spriteURLs.set(key,URL.createObjectURL(blob));img.src=spriteURLs.get(key);return}}catch(e){console.warn('Sprite importado',e)}
  img.src=SPRITE_ROOT+encodeURIComponent(dex)+'.png';
}
function sprite(p){if(p.sprite)return '<img class="sprite" src="'+esc(p.sprite)+'" alt="'+esc(p.species)+'">';return '<img class="sprite auto-sprite" data-pokeid="'+esc(p.id)+'" alt="'+esc(p.species)+'" onerror="this.style.opacity=.25">'}
function refreshSprites(){document.querySelectorAll('img.auto-sprite').forEach(updateSprite)}
function stats(){const live=db.pokemon.filter(p=>p.location!=='grave'&&p.lives>0);$('stats').innerHTML=[['Equipo',live.filter(p=>p.location==='team').length+'/6'],['En caja',live.filter(p=>p.location==='box').length],['Fallecidos',db.pokemon.filter(p=>p.location==='grave'||p.lives===0).length]].map(([a,b])=>'<div class="stat"><strong>'+b+'</strong><span>'+a+'</span></div>').join('')}
function render(){stats();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('add').style.display=tab==='settings'?'none':'block';if(tab==='settings')return renderSettings();if(tab==='zones')return renderZones();let arr=db.pokemon.filter(p=>tab==='grave'?p.location==='grave'||p.lives===0:p.location===tab&&p.lives>0);$('content').innerHTML='<div class="sectionhead"><h2>'+({team:'Equipo actual',box:'Caja Pokémon',grave:'Cementerio'}[tab])+'</h2><span class="muted">'+arr.length+' Pokémon</span></div>'+(arr.length?'<div class="cards">'+arr.map(p=>'<article class="poke" data-id="'+esc(p.id)+'">'+sprite(p)+'<h3>'+esc(p.nickname||p.species)+'</h3><small>'+esc(p.species)+' · Nv. '+esc(p.level)+'</small><div class="tags">'+[p.type1,p.type2].filter(Boolean).map(x=>'<span class="tag">'+esc(x)+'</span>').join('')+'</div>'+hearts(p.lives)+'<div class="cardbuttons"><button data-act="hurt" data-id="'+esc(p.id)+'" '+(p.lives<=0?'disabled':'')+'>− Vida</button><button data-act="edit" data-id="'+esc(p.id)+'">Ficha</button></div></article>').join('')+'</div>':'<div class="empty">Todavía no hay Pokémon aquí.<br>Usa ＋ para añadir uno.</div>');refreshSprites()}
function renderZones(){$('content').innerHTML='<div class="sectionhead"><h2>Registro de zonas</h2><button class="primary" id="addZone">＋ Zona</button></div><p class="muted">Una captura o robo por zona. Los regalos no consumen el encuentro.</p>'+(db.zones.length?db.zones.map(z=>'<div class="zone"><div><strong>'+esc(z.name)+'</strong><small>'+({available:'Disponible',used:'Encuentro utilizado',lost:'Encuentro perdido'}[z.state]||z.state)+'</small></div><button data-zone="'+esc(z.id)+'">Editar</button></div>').join(''):'<div class="empty">Aún no hay zonas registradas.</div>')}
function renderSettings(){$('content').innerHTML='<div class="panel"><h3>Configuración de la partida</h3><label>Level cap del siguiente jefe<input class="capinput" id="cap" type="number" min="1" max="100" value="'+esc(db.levelCap)+'"></label><p class="muted">Dificultad: Normal · 3 vidas por Pokémon · una captura o robo por zona.</p></div><div class="panel"><h3>Copias de seguridad y ChatGPT</h3><p class="muted">Exporta un JSON con tu equipo, caja, cementerio, zonas y vidas. Puedes enviármelo para analizar tu partida o pedirme que te prepare un JSON compatible.</p><div class="rowbuttons"><button class="primary" id="export">Exportar JSON</button><button id="import">Importar JSON</button><button id="copy">Copiar resumen</button></div><p class="settingsnote">Importar reemplaza la partida actual, tras pedir confirmación. Haz una exportación antes. Los datos se guardan en este navegador y pueden perderse si borras los datos del sitio.</p></div><div class="panel"><h3>Sprites Pokémon automáticos</h3><p class="muted">Al añadir una especie, la app consulta PokéAPI para reconocer su número de Pokédex y muestra su sprite pixel art. Si indicas el número de Pokédex en la ficha, no necesita consultar el nombre. No hace falta importar ni descargar colecciones.</p><p class="muted">Necesitas conexión para mostrar por primera vez un sprite. Los sprites ya vistos se guardan en caché para intentar mostrarlos sin conexión. Las especies exclusivas del hackrom admiten imágenes propias desde su ficha.</p><div class="rowbuttons"><button id="importSprites">Importar carpeta opcional</button><button id="spriteCount">Contar sprites propios/importados</button></div><p class="muted">Los sprites personalizados e importados no se incluyen en el JSON; exporta también las imágenes originales si quieres conservarlas al cambiar de dispositivo.</p></div><div class="panel"><h3>Restablecer</h3><button class="danger" id="reset">Borrar partida local</button></div>'}
function openEditor(id=null){editing=id;const p=db.pokemon.find(x=>x.id===id);const f=$('pokeForm');f.reset();$('editTitle').textContent=p?'Editar '+(p.nickname||p.species):'Nuevo Pokémon';for(const el of f.elements){if(el.name&&p&&p[el.name]!==undefined)el.value=p[el.name]}if(!p){f.elements.lives.value='3';f.elements.location.value=tab==='box'?'box':'team'}$('deletePoke').style.display=p?'block':'none';$('uploadSprite').style.display=p?'block':'none';$('editor').showModal();}
function savePoke(e){e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.level=Math.max(1,Math.min(100,Number(o.level)||1));o.lives=Math.max(0,Math.min(3,Number(o.lives)));o.dex=o.dex?Number(o.dex):null;o.species=o.species.trim();if(!o.species)return toast('Indica la especie');if(o.lives===0)o.location='grave';if(o.location==='team'&&db.pokemon.filter(p=>p.location==='team'&&p.lives>0&&p.id!==editing).length>=6)return toast('El equipo solo admite seis Pokémon');if(editing){const old=db.pokemon.find(p=>p.id===editing);Object.assign(old,o)}else db.pokemon.push({id:uid(),...o});save();$('editor').close();render();toast('Ficha guardada')}
function hurt(id){const p=db.pokemon.find(x=>x.id===id);if(!p||p.lives<1)return;if(!confirm('¿'+(p.nickname||p.species)+' ha sido debilitado? Perderá una vida.'))return;p.lives--;if(p.lives===0)p.location='grave';save();render();toast(p.lives?'Le quedan '+p.lives+' vidas':'Pokémon enviado al cementerio')}
function openZone(id=null){zoneEditing=id;const z=db.zones.find(x=>x.id===id);const f=$('zoneForm');f.reset();if(z)for(const el of f.elements){if(el.name&&z[el.name]!==undefined)el.value=z[el.name]}$('deleteZone').style.display=z?'block':'none';$('zoneEditor').showModal()}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function exportJSON(){download('rocket-nuzlocke-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(db,null,2),'application/json');toast('Copia exportada')}
function validImport(o){if(!o||typeof o!=='object'||!Array.isArray(o.pokemon)||!Array.isArray(o.zones))throw Error('El JSON debe contener pokemon y zones como listas');if(o.pokemon.length>3000)throw Error('Demasiados Pokémon');for(const p of o.pokemon){if(!p||typeof p.species!=='string'||!['team','box','grave'].includes(p.location)||!Number.isInteger(Number(p.lives))||Number(p.lives)<0||Number(p.lives)>3)throw Error('Ficha Pokémon inválida')}for(const z of o.zones)if(!z||typeof z.name!=='string')throw Error('Zona inválida');return {...initial(),...o,pokemon:o.pokemon.map(p=>({...p,id:p.id||uid()})),zones:o.zones.map(z=>({...z,id:z.id||uid()}))}}
function summary(){return 'Rocket Edition · Normal · cap '+db.levelCap+'\n'+db.pokemon.map(p=>[(p.nickname||p.species)+' ('+p.species+')','Nv '+p.level,p.lives+'/3 vidas',p.location,p.nature||'',p.ability||'',p.status||'',p.zone||'',Array.from({length:4},(_,i)=>p['move'+(i+1)]).filter(Boolean).join('/')].filter(Boolean).join(' · ')).join('\n')+'\nZonas: '+db.zones.map(z=>z.name+' ('+z.state+')').join(', ')}
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render()}});
$('add').onclick=()=>tab==='zones'?openZone():openEditor();$('uploadSprite').onclick=()=>$('spriteFile').click();
$('spriteFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||!editing)return;if(f.size>3*1024*1024)return toast('Usa una imagen de menos de 3 MB');try{await spritePut('custom:'+editing,f);const p=db.pokemon.find(x=>x.id===editing);if(p){p.customSprite=true;delete p.sprite;save();toast('Sprite personalizado guardado');render()}}catch(err){alert('No se pudo guardar la imagen: '+err.message)}};
$('spriteFolder').onchange=async e=>{const files=Array.from(e.target.files);e.target.value='';if(!files.length)return;let added=0,failed=0;const selected=new Map();for(const f of files){const path=f.webkitRelativePath||f.name;const m=path.match(/(?:^|\/)pokemon\/(\d+)\.(png|webp)$/i)||(!path.includes('/pokemon/')&&path.match(/(?:^|\/)(\d+)\.(png|webp)$/i));if(!m)continue;const n=Number(m[1]);if(n<1||n>9999)continue;selected.set(n,f)}if(!selected.size){alert('No se encontraron sprites numerados (por ejemplo 25.png). Selecciona una carpeta que contenga esas imágenes.');return}toast('Importando '+selected.size+' sprites...');for(const [dex,f] of selected){try{await spritePut('dex:'+dex,f);added++}catch{failed++}}render();alert('Sprites guardados para usar offline: '+added+(failed?' · Errores: '+failed:''))};
$('pokeForm').onsubmit=savePoke;$('zoneForm').onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));if(zoneEditing)Object.assign(db.zones.find(z=>z.id===zoneEditing),o);else db.zones.push({id:uid(),...o});save();$('zoneEditor').close();render()};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('deletePoke').onclick=()=>{if(confirm('¿Eliminar definitivamente esta ficha?')){db.pokemon=db.pokemon.filter(p=>p.id!==editing);save();$('editor').close();render()}};$('deleteZone').onclick=()=>{if(confirm('¿Eliminar esta zona?')){db.zones=db.zones.filter(z=>z.id!==zoneEditing);save();$('zoneEditor').close();render()}};
$('content').addEventListener('click',e=>{const b=e.target.closest('button');if(b){if(b.dataset.act==='hurt')return hurt(b.dataset.id);if(b.dataset.act==='edit')return openEditor(b.dataset.id);if(b.dataset.zone)return openZone(b.dataset.zone);if(b.id==='addZone')return openZone();if(b.id==='importSprites')return $('spriteFolder').click();if(b.id==='spriteCount'){spriteDB().then(d=>{const r=d.transaction('images').objectStore('images').count();r.onsuccess=()=>alert('Imágenes guardadas en este dispositivo: '+r.result)}).catch(e=>alert(e.message));return}if(b.id==='export')return exportJSON();if(b.id==='import')return $('importFile').click();if(b.id==='copy'){const s=summary();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(s).then(()=>toast('Resumen copiado')).catch(()=>toast('No se pudo copiar'));else toast('Copiar requiere HTTPS');return}if(b.id==='reset'&&confirm('¿Borrar TODOS los datos de esta partida? Exporta antes una copia.')){db=initial();save();render();return}}if(e.target.id==='cap'){return}const c=e.target.closest('.poke');if(c)openEditor(c.dataset.id)});
$('content').addEventListener('change',e=>{if(e.target.id==='cap'){db.levelCap=Math.max(1,Math.min(100,Number(e.target.value)||1));save();toast('Level cap actualizado')}});
$('importFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>12*1024*1024)throw Error('Archivo demasiado grande');const o=validImport(JSON.parse(await f.text()));if(!confirm('La importación reemplazará todos los datos actuales. ¿Continuar?'))return;db=o;save();render();toast('Partida importada')}catch(err){alert('No se pudo importar: '+err.message)}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').classList.remove('hidden')});$('install').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install').classList.add('hidden')}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
