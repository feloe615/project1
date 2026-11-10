(function(){
const KEY='resellingScaler.v1';
const DEFAULT={
  items:[],
  platforms:[
    {name:'eBay (gewerblich)',pct:11,fix:0.35},
    {name:'eBay (privat)',pct:0,fix:0},
    {name:'Vinted',pct:0,fix:0},
    {name:'Kleinanzeigen',pct:0,fix:0},
    {name:'Etsy',pct:10.5,fix:0.55},
    {name:'Eigener Shop',pct:3,fix:0.25}
  ],
  settings:{oldDays:60,fixed:0},
  checks:{}
};
const clone=o=>JSON.parse(JSON.stringify(o));
let S=clone(DEFAULT);

const $=id=>document.getElementById(id);
const eur=n=>(isFinite(n)?n:0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const pct=n=>isFinite(n)?n.toLocaleString('de-DE',{maximumFractionDigits:0})+' %':'–';
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const days=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
const newId=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));

/* ---------- Dialog & Hinweise (alert/confirm gibt es im Viewer nicht) ---------- */
function ask(text,yes='OK'){
  return new Promise(res=>{
    $('modalText').textContent=text;$('modalYes').textContent=yes;$('modal').hidden=false;$('modalNo').focus();
    const done=v=>{$('modal').hidden=true;$('modalYes').onclick=$('modalNo').onclick=null;res(v)};
    $('modalYes').onclick=()=>done(true);$('modalNo').onclick=()=>done(false);
  });
}
let toastT;
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>$('toast').hidden=true,3500)}
function banner(msg){$('banner').hidden=!msg;$('banner').textContent=msg||''}

/* ---------- Speicher: Supabase (Konto) ---------- */
const cfg=window.RESELLING_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&!/DEIN/.test(cfg.supabaseUrl+cfg.supabaseAnonKey));
const sb=window.__sbOverride||(configured&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null);
const store={uid:null,email:'',loadedAt:0};
const isUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));
function toRow(it){return {id:it.id,user_id:store.uid,name:it.name||'Ohne Namen',cat:it.cat||null,src:it.src||null,buy:num(it.buy),
  buy_date:it.buyDate||null,plat:it.plat||null,sell:it.sell===''||it.sell==null?null:num(it.sell),sell_date:it.sellDate||null,ship:num(it.ship)}}
function fromRow(r){return {id:r.id,name:r.name||'',cat:r.cat||'',src:r.src||'',buy:num(r.buy),buyDate:r.buy_date||'',plat:r.plat||'',
  sell:r.sell==null?'':num(r.sell),sellDate:r.sell_date||'',ship:num(r.ship)}}
function failed(e){toast('Speichern fehlgeschlagen: '+(e&&e.message||'keine Verbindung')+'. Bitte erneut versuchen.')}
async function run(q){const {data,error}=await q;if(error)throw error;return data}

async function putItem(it){
  const i=S.items.findIndex(x=>x.id===it.id);if(i>=0)S.items[i]=it;else S.items.push(it);
  try{await run(sb.from('items').upsert(toRow(it)))}catch(e){failed(e)}
}
async function removeItem(id){
  S.items=S.items.filter(i=>i.id!==id);
  try{await run(sb.from('items').delete().eq('id',id))}catch(e){failed(e)}
}
let stateT;
function saveState(){
  clearTimeout(stateT);
  stateT=setTimeout(()=>run(sb.from('user_settings').upsert({user_id:store.uid,platforms:S.platforms,settings:S.settings,checks:S.checks,updated_at:new Date().toISOString()})).catch(failed),600);
}
async function putMany(items){
  items.forEach(it=>{const i=S.items.findIndex(x=>x.id===it.id);if(i>=0)S.items[i]=it;else S.items.push(it)});
  for(let k=0;k<items.length;k+=500){try{await run(sb.from('items').upsert(items.slice(k,k+500).map(toRow)))}catch(e){failed(e);break}}
  renderAll();
}
async function loadData(){
  banner('');
  try{
    const [rows,st]=await Promise.all([run(sb.from('items').select('*').order('created_at')),run(sb.from('user_settings').select('*').maybeSingle())]);
    S=clone(DEFAULT);S.items=(rows||[]).map(fromRow);
    if(st){if(Array.isArray(st.platforms)&&st.platforms.length)S.platforms=st.platforms;S.settings=Object.assign({},DEFAULT.settings,st.settings);S.checks=st.checks||{}}
    store.loadedAt=Date.now();prefilled=false;renderAll();
  }catch(e){banner('Deine Daten konnten nicht geladen werden ('+(e.message||'keine Verbindung')+'). Prüfe die Verbindung und lade die Seite neu.')}
}
// Beim Zurückkehren in den Tab neu laden, damit Änderungen von anderen Geräten erscheinen
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&store.uid&&Date.now()-store.loadedAt>60000)loadData()});

function saveFile(name,text,type){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ---------- Anmeldung ---------- */
function show(view){['setup','auth','recover','app'].forEach(v=>$(v).hidden=v!==view);
  const inApp=view==='app';$('accStatus').hidden=!inApp;$('logoutTop').hidden=!inApp}
let authMode='login';
function authMsg(text,ok){$('authMsg').hidden=!text;$('authMsg').textContent=text||'';$('authMsg').className='msg '+(ok?'ok':'err')}
function setAuthMode(m){
  authMode=m;authMsg('');
  document.querySelectorAll('#authSwitch button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  const t={login:['Anmelden','Melde dich an, um deine Daten zu sehen.','Anmelden'],signup:['Konto erstellen','Kostenlos registrieren. Du bekommst eine E-Mail zur Bestätigung.','Konto erstellen'],reset:['Passwort zurücksetzen','Wir schicken dir einen Link per E-Mail.','Link senden']}[m];
  $('authTitle').textContent=t[0];$('authSub').textContent=t[1];$('authBtn').textContent=t[2];
  $('pwWrap').hidden=m==='reset';$('a_pw').required=m!=='reset';
  $('a_pw').autocomplete=m==='signup'?'new-password':'current-password';
  $('forgot').textContent=m==='reset'?'Zurück zur Anmeldung':'Passwort vergessen?';
}
$('authSwitch').onclick=e=>{const b=e.target.closest('button');if(b)setAuthMode(b.dataset.mode)};
$('forgot').onclick=()=>setAuthMode(authMode==='reset'?'login':'reset');
const authErr=e=>{const m=(e&&e.message)||'';
  if(/Invalid login/i.test(m))return 'E-Mail oder Passwort ist falsch.';
  if(/Email not confirmed/i.test(m))return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.';
  if(/already registered/i.test(m))return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
  if(/Password should be/i.test(m))return 'Das Passwort ist zu kurz oder zu einfach (mind. 8 Zeichen).';
  if(/rate limit/i.test(m))return 'Zu viele Versuche. Warte kurz und versuche es erneut.';
  return m||'Das hat nicht geklappt. Bitte erneut versuchen.'};
$('authForm').onsubmit=async e=>{
  e.preventDefault();const email=$('a_email').value.trim(),password=$('a_pw').value;$('authBtn').disabled=true;authMsg('');
  try{
    if(authMode==='login'){const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error}
    else if(authMode==='signup'){const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
      if(!data.session)authMsg('Fast geschafft: Bestätige deine E-Mail über den Link, den wir dir geschickt haben. Danach kannst du dich anmelden.',true)}
    else{const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;
      authMsg('Wenn ein Konto zu dieser E-Mail existiert, ist der Link unterwegs. Schau in dein Postfach.',true)}
  }catch(err){authMsg(authErr(err))}
  $('authBtn').disabled=false;
};
$('recoverForm').onsubmit=async e=>{
  e.preventDefault();const {error}=await sb.auth.updateUser({password:$('r_pw').value});
  $('recoverMsg').hidden=false;
  if(error){$('recoverMsg').className='msg err';$('recoverMsg').textContent=authErr(error)}
  else{$('recoverMsg').className='msg ok';$('recoverMsg').textContent='Passwort gespeichert.';setTimeout(()=>{recovering=false;sb.auth.getSession().then(({data})=>onSession(data.session))},1200)}
};
$('pwForm').onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.updateUser({password:$('n_pw').value});
  if(error)toast(authErr(error));else{$('n_pw').value='';toast('Passwort geändert')}};
async function logout(){await sb.auth.signOut();toast('Abgemeldet')}
$('logout').onclick=logout;$('logoutTop').onclick=logout;

let recovering=false;
function onSession(session){
  if(recovering){show('recover');return}
  if(!session){store.uid=null;S=clone(DEFAULT);show('auth');return}
  if(store.uid===session.user.id){show('app');return}
  store.uid=session.user.id;store.email=session.user.email||'';
  $('accStatus').textContent=store.email;$('acctEmail').textContent=store.email;
  show('app');renderAll();loadData();
}
function startAuth(){
  if(!sb){show('setup');return}
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){recovering=true;show('recover');return}
    setTimeout(()=>onSession(session),0);
  });
  sb.auth.getSession().then(({data})=>onSession(data.session));
}

/* ---------- Berechnung ---------- */
function plat(name){return S.platforms.find(p=>p.name===name)||{pct:0,fix:0}}
function fees(price,platName){const p=plat(platName);return price>0?price*num(p.pct)/100+num(p.fix):0}
function calcItem(it){
  const sold=it.sell!==''&&it.sell!=null;
  const f=sold?fees(num(it.sell),it.plat):0;
  const profit=sold?num(it.sell)-num(it.buy)-num(it.ship)-f:null;
  const roi=sold&&num(it.buy)>0?profit/num(it.buy)*100:null;
  return {sold,fees:f,profit,roi,age:days(it.buyDate||today(),sold&&it.sellDate?it.sellDate:today())};
}

/* ---------- Theme ---------- */
$('themeBtn').onclick=()=>{
  const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const next=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=next;
  try{localStorage.setItem(KEY+'.theme',next)}catch(e){}
  renderPlan();
};
try{const t=localStorage.getItem(KEY+'.theme');if(t)document.documentElement.dataset.theme=t}catch(e){}

/* ---------- Tabs ---------- */
$('tabs').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('section.tab').forEach(s=>s.classList.toggle('active',s.id===b.dataset.tab));
  if(b.dataset.tab==='plan')prefillPlan();
};

function bars(el,rows,fmt=eur){
  if(!rows.length){el.innerHTML='<div class="empty">Noch keine Verkäufe erfasst. Trag unter „Lager & Verkäufe“ deinen ersten Verkauf ein.</div>';return}
  const max=Math.max(...rows.map(r=>Math.abs(r.v)),1);
  el.innerHTML=rows.map(r=>`<div class="bar-row"><span class="ellip" title="${esc(r.k)}">${esc(r.k)}</span><div><div class="bar ${r.v<0?'neg':''}" style="width:${Math.max(2,Math.abs(r.v)/max*100)}%"></div></div><span class="num">${fmt(r.v)}</span></div>`).join('');
}

/* ---------- Dashboard ---------- */
function renderDash(){
  const rows=S.items.map(it=>({it,...calcItem(it)}));
  const sold=rows.filter(r=>r.sold),stock=rows.filter(r=>!r.sold);
  const revenue=sold.reduce((a,r)=>a+num(r.it.sell),0);
  const profit=sold.reduce((a,r)=>a+r.profit,0);
  const cost=sold.reduce((a,r)=>a+num(r.it.buy),0);
  const stockVal=stock.reduce((a,r)=>a+num(r.it.buy),0);
  const avgDays=sold.length?sold.reduce((a,r)=>a+r.age,0)/sold.length:0;
  const p30=sold.filter(r=>r.it.sellDate&&days(r.it.sellDate,today())<=30).reduce((a,r)=>a+r.profit,0)-num(S.settings.fixed);
  const k=[
    ['Umsatz gesamt',eur(revenue)],
    ['Gewinn gesamt',eur(profit),profit>=0?'pos':'neg'],
    ['Gewinn 30 Tage (nach Fixkosten)',eur(p30),p30>=0?'pos':'neg'],
    ['Marge',revenue?pct(profit/revenue*100):'–'],
    ['ROI',cost?pct(profit/cost*100):'–'],
    ['Verkauft / Im Lager',`${sold.length} / ${stock.length}`],
    ['Kapital im Lager',eur(stockVal)],
    ['Ø Tage bis Verkauf',sold.length?avgDays.toFixed(0):'–']
  ];
  $('kpis').innerHTML=k.map(([l,v,c])=>`<div class="kpi"><div class="l">${l}</div><div class="v ${c||''}">${v}</div></div>`).join('');
  const byMonth={};sold.forEach(r=>{const m=(r.it.sellDate||r.it.buyDate).slice(0,7);byMonth[m]=(byMonth[m]||0)+r.profit});
  bars($('monthChart'),Object.keys(byMonth).sort().slice(-12).map(m=>({k:new Date(m+'-01').toLocaleDateString('de-DE',{month:'short',year:'2-digit'}),v:byMonth[m]})));
  const byPlat={};sold.forEach(r=>{byPlat[r.it.plat]=(byPlat[r.it.plat]||0)+r.profit});
  bars($('platformChart'),Object.entries(byPlat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({k,v})));
  const byCat={};sold.forEach(r=>{const c=r.it.cat||'Ohne Kategorie';(byCat[c]=byCat[c]||[]).push(r.profit)});
  bars($('catChart'),Object.entries(byCat).map(([k,a])=>({k:`${k} (${a.length})`,v:a.reduce((x,y)=>x+y,0)/a.length})).sort((a,b)=>b.v-a.v).slice(0,8));
  $('oldDaysLbl').textContent=S.settings.oldDays;
  const old=stock.filter(r=>r.age>num(S.settings.oldDays)).sort((a,b)=>b.age-a.age);
  $('oldList').innerHTML=old.length?`<p class="muted" style="margin-top:0">${eur(old.reduce((a,r)=>a+num(r.it.buy),0))} gebundenes Kapital. Tipp: Preis senken, neu einstellen oder im Bundle verkaufen.</p>`+old.slice(0,8).map(r=>`<div class="bar-row" style="grid-template-columns:minmax(0,1fr) auto auto"><span class="ellip">${esc(r.it.name)}</span><span class="pill old">${r.age} Tage</span><span class="num">${eur(num(r.it.buy))}</span></div>`).join(''):'<div class="empty">Keine Ladenhüter.</div>';
}

/* ---------- Lager ---------- */
function fillSelects(){
  const cur=$('f_plat').value;
  $('f_plat').innerHTML=S.platforms.map(p=>`<option>${esc(p.name)}</option>`).join('');
  if(cur&&S.platforms.some(p=>p.name===cur))$('f_plat').value=cur;
  const uniq=k=>[...new Set(S.items.map(i=>i[k]).filter(Boolean))];
  $('catList').innerHTML=uniq('cat').map(c=>`<option value="${esc(c)}">`).join('');
  $('srcList').innerHTML=uniq('src').map(c=>`<option value="${esc(c)}">`).join('');
}
function renderItems(){
  const f=$('filterStatus').value,q=$('search').value.toLowerCase();
  const list=S.items.map(it=>({it,...calcItem(it)}))
    .filter(r=>f==='all'||(f==='sold'?r.sold:!r.sold))
    .filter(r=>!q||[r.it.name,r.it.cat,r.it.src,r.it.plat].join(' ').toLowerCase().includes(q))
    .sort((a,b)=>String(b.it.sellDate||b.it.buyDate).localeCompare(String(a.it.sellDate||a.it.buyDate)));
  $('itemRows').innerHTML=list.length?list.map(r=>`<tr>
    <td>${esc(r.it.name)}</td><td>${esc(r.it.cat)}</td><td>${esc(r.it.plat)}</td>
    <td class="num">${eur(num(r.it.buy))}</td>
    <td class="num">${r.sold?eur(num(r.it.sell)):'–'}</td>
    <td class="num">${r.sold?eur(r.fees):'–'}</td>
    <td class="num ${r.sold?(r.profit>=0?'pos':'neg'):''}">${r.sold?eur(r.profit):'–'}</td>
    <td class="num">${r.roi!=null?pct(r.roi):'–'}</td>
    <td>${r.sold?'<span class="pill sold">verkauft</span>':`<span class="pill ${r.age>num(S.settings.oldDays)?'old':''}">${r.age} T. im Lager</span>`}</td>
    <td><button class="btn ghost small" data-edit="${esc(r.it.id)}" aria-label="Bearbeiten">Bearbeiten</button> <button class="btn ghost small danger" data-del="${esc(r.it.id)}" aria-label="Löschen">Löschen</button></td>
  </tr>`).join(''):'<tr><td colspan="10" class="empty">Noch keine Artikel. Füge oben deinen ersten Artikel hinzu oder lade unter „Einstellungen“ Beispieldaten.</td></tr>';
}
function resetForm(){
  $('itemForm').reset();$('f_id').value='';$('f_buyDate').value=today();$('f_ship').value=0;
  $('formTitle').textContent='Artikel hinzufügen';$('cancelEdit').hidden=true;
}
$('itemForm').onsubmit=async e=>{
  e.preventDefault();
  const sell=$('f_sell').value;
  const it={id:$('f_id').value||newId(),name:$('f_name').value.trim(),cat:$('f_cat').value.trim(),src:$('f_src').value.trim(),
    buy:num($('f_buy').value),buyDate:$('f_buyDate').value,plat:$('f_plat').value,
    sell:sell===''?'':num(sell),sellDate:sell===''?'':($('f_sellDate').value||today()),ship:num($('f_ship').value)};
  resetForm();await putItem(it);renderAll();toast('Gespeichert');
};
$('cancelEdit').onclick=resetForm;
$('itemRows').onclick=async e=>{
  const b=e.target.closest('button');if(!b)return;
  const ed=b.dataset.edit,del=b.dataset.del;
  if(del){const it=S.items.find(i=>i.id===del);if(await ask(`„${it?it.name:'Artikel'}“ löschen?`,'Löschen')){await removeItem(del);renderAll();toast('Gelöscht')}}
  if(ed){const it=S.items.find(i=>i.id===ed);if(!it)return;
    $('f_id').value=it.id;$('f_name').value=it.name;$('f_cat').value=it.cat||'';$('f_src').value=it.src||'';
    $('f_buy').value=it.buy;$('f_buyDate').value=it.buyDate;$('f_plat').value=it.plat;
    $('f_sell').value=it.sell;$('f_sellDate').value=it.sellDate||'';$('f_ship').value=it.ship;
    $('formTitle').textContent='Artikel bearbeiten';$('cancelEdit').hidden=false;$('itemForm').scrollIntoView({behavior:'smooth'})}
};
$('filterStatus').onchange=renderItems;$('search').oninput=renderItems;

/* ---------- CSV ---------- */
const COLS=['name','cat','src','buy','buyDate','plat','sell','sellDate','ship'];
$('exportCsv').onclick=()=>{
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[[...COLS,'gebuehren','gewinn'].join(';'),...S.items.map(it=>{const c=calcItem(it);return [...COLS.map(k=>q(it[k])),c.sold?c.fees.toFixed(2):'',c.sold?c.profit.toFixed(2):''].join(';')})];
  saveFile('reselling-'+today()+'.csv','﻿'+lines.join('\n'),'text/csv');
};
function parseCsv(t){
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;else if(c===';'||c===','){row.push(cur);cur=''}
    else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur=''}else if(c!=='\r')cur+=c}
  if(cur||row.length){row.push(cur);rows.push(row)}return rows;
}
$('importCsv').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;e.target.value='';
  const rows=parseCsv((await f.text()).replace(/^﻿/,''));const head=(rows.shift()||[]).map(h=>h.trim());
  if(!head.includes('name')){toast('Unbekanntes Format: Die erste Zeile braucht mindestens die Spalte „name“.');return}
  const items=[];rows.forEach(r=>{if(!r.join('').trim())return;const it={id:newId()};
    COLS.forEach(k=>{const i=head.indexOf(k);it[k]=i>=0?r[i]:''});
    ['buy','ship'].forEach(k=>it[k]=num(String(it[k]).replace(',','.')));
    if(it.sell!=='')it.sell=num(String(it.sell).replace(',','.'));
    if(!it.buyDate)it.buyDate=today();if(!it.plat)it.plat=S.platforms[0].name;items.push(it)});
  toast(`Importiere ${items.length} Artikel…`);await putMany(items);toast(`${items.length} Artikel importiert`);
};

/* ---------- Gewinnrechner ---------- */
function renderCalc(){
  const sell=num($('c_sell').value),buy=num($('c_buy').value),ship=num($('c_ship').value),roi=num($('c_roi').value);
  $('calcRows').innerHTML=S.platforms.map(p=>{
    const f=fees(sell,p.name),pr=sell-buy-ship-f,maxBuy=(sell-ship-f)/(1+roi/100);
    return `<tr><td>${esc(p.name)}</td><td class="num">${eur(f)}</td><td class="num ${pr>=0?'pos':'neg'}">${eur(pr)}</td>
      <td class="num">${sell?pct(pr/sell*100):'–'}</td><td class="num">${buy?pct(pr/buy*100):'–'}</td><td class="num"><b>${eur(Math.max(0,maxBuy))}</b></td></tr>`}).join('');
}
['c_sell','c_buy','c_ship','c_roi'].forEach(id=>$(id).oninput=renderCalc);

/* ---------- Skalierungsplan ---------- */
let prefilled=false;
function prefillPlan(){
  if(prefilled)return;
  const sold=S.items.map(it=>({it,...calcItem(it)})).filter(r=>r.sold);
  if(sold.length>=3){
    prefilled=true;
    $('p_avgProfit').value=(sold.reduce((a,r)=>a+r.profit,0)/sold.length).toFixed(2);
    $('p_avgBuy').value=(sold.reduce((a,r)=>a+num(r.it.buy),0)/sold.length).toFixed(2);
    $('p_days').value=Math.max(1,Math.round(sold.reduce((a,r)=>a+r.age,0)/sold.length));
    const cost=sold.reduce((a,r)=>a+num(r.it.buy),0);
    if(cost>0)$('s_roi').value=Math.round(sold.reduce((a,r)=>a+r.profit,0)/cost*100);
  }
  renderPlan();
}
function renderPlan(){
  const fixed=num(S.settings.fixed),goal=num($('p_goal').value),need=goal+fixed,ap=num($('p_avgProfit').value),ab=num($('p_avgBuy').value);
  const d=Math.max(1,num($('p_days').value)),mins=num($('p_min').value),st=Math.max(1,num($('p_sellThrough').value))/100;
  if(ap<=0){$('goalResult').textContent='Der Ø Gewinn je Verkauf muss größer als 0 sein.'}
  else{
    const salesM=Math.ceil(need/ap),listM=Math.ceil(salesM/st),stockNeeded=Math.ceil(salesM*d/30/st),capital=stockNeeded*ab;
    const hours=listM*mins/60,hourly=hours?goal/hours:0,perWeek=hours/4.33;
    $('goalResult').innerHTML=`Für <b>${eur(goal)}</b> Gewinn pro Monat${fixed?` (plus ${eur(fixed)} Fixkosten)`:''} brauchst du:
      <ul style="margin:8px 0 0;padding-left:20px">
      <li><b>${salesM}</b> Verkäufe pro Monat (≈ <b>${(salesM/4.33).toFixed(1)}</b> pro Woche, <b>${(salesM/30).toFixed(1)}</b> pro Tag)</li>
      <li><b>${listM}</b> neue Artikel pro Monat einkaufen und einstellen</li>
      <li>ca. <b>${stockNeeded}</b> Artikel dauerhaft im Lager, also <b>${eur(capital)}</b> gebundenes Kapital</li>
      <li>ca. <b>${hours.toFixed(0)} Std.</b> Arbeit pro Monat (≈ ${perWeek.toFixed(1)} Std./Woche), das sind <b>${eur(hourly)}</b> pro Stunde</li></ul>
      <p class="muted" style="margin:8px 0 0">${perWeek>20?'Über 20 Std./Woche: Lager Fotos und Versand aus oder kauf höherpreisige Artikel ein, damit du pro Stunde mehr verdienst.':'Größter Hebel: Ein höherer Ø Gewinn je Artikel senkt Zeit- und Kapitalbedarf am stärksten.'}</p>`;
  }
  let cap=num($('s_cap').value);const r=num($('s_roi').value)/100,t=num($('s_turns').value),re=num($('s_reinv').value)/100,max=num($('s_max').value)||Infinity;
  const M=Math.min(36,Math.max(1,Math.round(num($('s_months').value))||1));const data=[];let taken=0;
  for(let m=1;m<=M;m++){const p=cap*r*t,reinv=p*re;let next=cap+reinv,overflow=0;if(next>max){overflow=next-max;next=max}taken+=p-reinv+overflow;data.push({m,p,take:p-reinv+overflow});cap=next}
  drawSim(data);
  $('simResult').innerHTML=`Nach ${M} Monaten: Kapital <b>${eur(cap)}</b>, Monatsgewinn <b>${eur(data[data.length-1].p)}</b>, insgesamt entnommen <b>${eur(taken)}</b>.${cap>=max?' <span class="muted">Kapitallimit erreicht. Ab hier wächst nur noch die Entnahme. Um weiter zu wachsen, brauchst du mehr Lagerplatz, Zeit oder Hilfe.</span>':''}`;
}
function drawSim(data){
  const W=600,H=220,P=44,max=Math.max(...data.map(d=>d.p),1),bw=(W-P-10)/data.length;
  let svg=`<svg class="chart" viewBox="0 0 ${W} ${H+24}" role="img" aria-label="Monatsgewinn und Entnahme je Monat">`;
  for(let i=0;i<=4;i++){const y=10+(H-20)*i/4;svg+=`<line x1="${P}" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${P-6}" y="${y+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${Math.round(max*(1-i/4)).toLocaleString('de-DE')}</text>`}
  data.forEach((d,i)=>{const x=P+i*bw+2,h=(H-20)*d.p/max,ht=(H-20)*d.take/max;
    svg+=`<rect x="${x}" y="${H-10-h}" width="${bw-4}" height="${h}" rx="2" style="fill:var(--accent)"><title>Monat ${d.m}: Gewinn ${eur(d.p)}, Entnahme ${eur(d.take)}</title></rect>`;
    svg+=`<rect x="${x}" y="${H-10-ht}" width="${bw-4}" height="${ht}" rx="2" style="fill:var(--good)"/>`;
    svg+=`<text x="${x+(bw-4)/2}" y="${H+6}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${d.m}</text>`});
  svg+=`</svg><div class="row muted" style="font-size:.8rem;gap:14px"><span><span style="display:inline-block;width:10px;height:10px;background:var(--accent);border-radius:2px"></span> Gewinn pro Monat</span><span><span style="display:inline-block;width:10px;height:10px;background:var(--good);border-radius:2px"></span> davon entnommen</span></div>`;
  $('simChart').innerHTML=svg;
}
document.querySelectorAll('#plan input').forEach(i=>i.oninput=renderPlan);

/* ---------- Checkliste ---------- */
const CHECK=[
  ['Stufe 1: Fundament',[
    'Jeden Einkauf und Verkauf hier erfassen',
    'Gewerbe anmelden und Steuerfrage klären (z. B. Kleinunternehmerregelung), ggf. mit Steuerberatung',
    'Separates Geschäftskonto für das Reselling nutzen',
    'Feste Foto-Ecke mit gutem Licht und neutralem Hintergrund einrichten',
    'Vorlagen für Titel, Beschreibung und Maße der wichtigsten Kategorien anlegen']],
  ['Stufe 2: Effizienz',[
    'Die 2–3 profitabelsten Kategorien im Dashboard finden und darauf fokussieren',
    'Verlässliche Einkaufsquellen aufbauen (Haushaltsauflösungen, Restposten, feste Flohmärkte)',
    'Fotos, Einstellen und Versand an festen Tagen bündeln',
    'Versandmaterial in größeren Mengen günstiger kaufen',
    'Ladenhüter-Regel festlegen: nach X Tagen Preis senken oder im Bundle verkaufen']],
  ['Stufe 3: Reichweite',[
    'Auf mindestens einer weiteren Plattform einstellen',
    'Lagerplätze nummerieren (z. B. Kiste A3) und beim Artikel notieren',
    'Kanal für Stammkundschaft aufbauen (Instagram, WhatsApp-Kanal, Newsletter)',
    'Eigenen Shop prüfen, sobald genug Stammkundschaft da ist']],
  ['Stufe 4: Skalieren',[
    'Wiederkehrende Aufgaben auslagern (Fotos, Verpackung), z. B. per Minijob',
    'Feste monatliche Reinvestitionsquote festlegen',
    'Größeres Lager anmieten, wenn Platz zum Engpass wird',
    'Monatliches Review: Kennzahlen prüfen und Ziel im Skalierungsplan anpassen']]
];
function renderCheck(){
  let total=0,done=0,html='';
  CHECK.forEach(([h,items],s)=>{html+=`<h3>${h}</h3>`;items.forEach((t,i)=>{const k=`s${s}_${i}`;total++;if(S.checks[k])done++;
    html+=`<label><input type="checkbox" id="chk_${k}" data-k="${k}" ${S.checks[k]?'checked':''}><span>${esc(t)}</span></label>`})});
  $('checklist').innerHTML=html;$('progBar').style.width=(done/total*100)+'%';$('progTxt').textContent=`${done} von ${total}`;
}
$('checklist').onchange=e=>{const k=e.target.dataset.k;if(k){S.checks[k]=e.target.checked;saveState();renderCheck()}};

/* ---------- Einstellungen ---------- */
function renderPlats(){
  $('platRows').innerHTML=S.platforms.map((p,i)=>`<tr>
    <td><input id="pl_n${i}" data-i="${i}" data-f="name" value="${esc(p.name)}" style="min-width:140px"></td>
    <td class="num"><input id="pl_p${i}" data-i="${i}" data-f="pct" type="number" step="0.1" value="${p.pct}" style="width:90px;text-align:right"></td>
    <td class="num"><input id="pl_f${i}" data-i="${i}" data-f="fix" type="number" step="0.01" value="${p.fix}" style="width:90px;text-align:right"></td>
    <td><button class="btn ghost small danger" data-rm="${i}">Entfernen</button></td></tr>`).join('');
  $('set_old').value=S.settings.oldDays;$('set_fixed').value=S.settings.fixed;
}
$('platRows').onchange=async e=>{const i=e.target.dataset.i,f=e.target.dataset.f;if(i==null)return;
  const old=S.platforms[i].name;S.platforms[i][f]=f==='name'?e.target.value.trim():num(e.target.value);
  saveState();
  if(f==='name'&&old!==S.platforms[i].name){const moved=S.items.filter(it=>it.plat===old).map(it=>Object.assign({},it,{plat:S.platforms[i].name}));if(moved.length)await putMany(moved)}
  renderAll()};
$('platRows').onclick=async e=>{const i=e.target.dataset.rm;if(i==null)return;
  if(S.platforms.length<2){toast('Mindestens eine Plattform muss bleiben.');return}
  if(await ask(`Plattform „${S.platforms[i].name}“ entfernen? Bestehende Artikel behalten den Namen, werden aber ohne Gebühren gerechnet.`,'Entfernen')){S.platforms.splice(i,1);saveState();renderAll()}};
$('addPlat').onclick=()=>{S.platforms.push({name:'Neue Plattform',pct:0,fix:0});saveState();renderAll()};
$('set_old').onchange=e=>{S.settings.oldDays=num(e.target.value);saveState();renderAll()};
$('set_fixed').onchange=e=>{S.settings.fixed=num(e.target.value);saveState();renderAll()};
$('backup').onclick=()=>saveFile('reselling-backup-'+today()+'.json',JSON.stringify(S,null,2),'application/json');
async function importState(obj){
  const n=Object.assign(clone(DEFAULT),obj);
  S.platforms=n.platforms;S.settings=n.settings;S.checks=n.checks;saveState();
  await putMany((n.items||[]).map(it=>Object.assign({},it,{id:isUuid(it.id)?it.id:newId()})));
}
$('restore').onchange=async e=>{const f=e.target.files[0];if(!f)return;e.target.value='';
  let obj;try{obj=JSON.parse(await f.text())}catch(err){toast('Die Datei ist kein gültiges Backup.');return}
  await importState(obj);toast('Backup geladen')};
$('wipe').onclick=async()=>{
  if(!await ask('Wirklich ALLE Daten löschen? Lade vorher am besten ein Backup herunter.','Alles löschen'))return;
  try{await run(sb.from('items').delete().eq('user_id',store.uid));await run(sb.from('user_settings').delete().eq('user_id',store.uid))}catch(e){failed(e);return}
  S=clone(DEFAULT);prefilled=false;renderAll();toast('Alle Daten gelöscht');
};
$('demo').onclick=async()=>{
  const cats=[['Sneaker',35,90],['Vintage-Jacken',12,45],['Elektronik',40,85],['Bücher',1,9],['Spielzeug/LEGO',20,55]];
  const pl=S.platforms.map(p=>p.name),now=Date.now(),items=[];
  for(let i=0;i<40;i++){const [c,b,s]=cats[i%cats.length];const bd=new Date(now-(Math.random()*300+5)*864e5);
    const sold=Math.random()<.8;const sd=new Date(Math.min(now,bd.getTime()+(Math.random()*50+3)*864e5));
    items.push({id:newId(),name:`Beispiel: ${c} #${i+1}`,cat:c,src:['Flohmarkt','Kleinanzeigen','Restposten'][i%3],
      buy:+(b*(.6+Math.random()*.8)).toFixed(2),buyDate:bd.toISOString().slice(0,10),plat:pl[i%pl.length],
      sell:sold?+(s*(.7+Math.random()*.6)).toFixed(2):'',sellDate:sold?sd.toISOString().slice(0,10):'',ship:sold?+(Math.random()*4).toFixed(2):0})}
  $('demo').disabled=true;toast('Lade 40 Beispielartikel…');await putMany(items);$('demo').disabled=false;prefilled=false;toast('40 Beispielartikel geladen');
};

function renderAll(){fillSelects();renderDash();renderItems();renderCalc();renderPlan();renderCheck();renderPlats()}
resetForm();renderAll();
startAuth();
})();
