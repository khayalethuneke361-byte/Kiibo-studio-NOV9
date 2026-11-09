/* Kiibo Control: talks to the same Supabase project as Kiibo Studios. No secret key lives in this app. */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ymd=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
const todayS=()=>ymd(new Date());
const days=d=>Math.round((new Date(d+'T00:00:00')-new Date(todayS()+'T00:00:00'))/864e5);
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+n);return ymd(x)};
const fmt=t=>t?new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Never';
const init=n=>String(n).split(/\s+|@/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
/* ----- sign in ----- */
let SES=null;try{SES=JSON.parse(localStorage.getItem('kc_ses')||'null')}catch(e){}
async function auth(path,body){const r=await fetch(CLOUD.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:CLOUD.key,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.msg||j.error_description||j.message||'Sign in failed');return j}
function keep(j){SES={at:j.access_token,rt:j.refresh_token,exp:Date.now()+j.expires_in*1000-60000};try{localStorage.setItem('kc_ses',JSON.stringify(SES))}catch(e){}}
async function tok(){if(!SES)throw new Error('Signed out');if(Date.now()>SES.exp)keep(await auth('token?grant_type=refresh_token',{refresh_token:SES.rt}));return SES.at}
async function rpc(fn,args={}){const r=await fetch(CLOUD.url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:CLOUD.key,Authorization:'Bearer '+await tok(),'Content-Type':'application/json'},body:JSON.stringify(args)});const t=await r.text();let j;try{j=JSON.parse(t)}catch(e){j=t}if(!r.ok)throw new Error(j.message||j.msg||t);return j}
/* ----- state ----- */
let tab='home',q='',fl='all',sel=null,D=null,busy=false,loginErr='';
const TABS=[['home','Overview'],['acc','Accounts'],['clubs','Clubs'],['dev','Phones'],['log','Activity'],['more','More']];
const icons={home:'<path d="M3 11l9-8 9 8v10H3z"/>',acc:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',clubs:'<path d="M4 20V8l8-5 8 5v12zM9 20v-6h6v6"/>',dev:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',log:'<path d="M5 4h14M5 10h14M5 16h9"/>',more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'};
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2600)}
async function login(){const e=$('#em').value.trim(),p=$('#pw').value;loginErr='';try{keep(await auth('token?grant_type=password',{email:e,password:p}));if((await rpc('is_platform_admin'))!==true)return out('This account is not a platform owner.');load()}catch(x){loginErr=x.message;render()}}
function out(msg){SES=null;D=null;sel=null;try{localStorage.removeItem('kc_ses')}catch(e){}loginErr=msg||'';render()}
async function load(){busy=true;render();try{
const[u,c,l]=await Promise.all([rpc('admin_users'),rpc('admin_clubs'),rpc('admin_activity')]);
const C=c.map(x=>({id:x.id,name:x.name,plan:x.plan,active:x.active,until:x.paid_until,grace:x.grace_days,members:x.members,live:x.live,owner:x.owner_email}));
const A=u.map(x=>({id:x.user_id,email:x.email||'(no email)',name:x.full_name||x.email||'Unnamed',club:x.club_id,clubName:x.club_name||'No club',role:x.role||'none',seen:x.last_seen,devs:x.devices||[],st:x.banned?'banned':!x.club_id?'noclub':x.status=='removed'?'removed':x.status=='pending'?'pending':'active'}));
D={C,A,L:l};try{X.sp=await rpc('admin_sport_overview')}catch(e){X.sp=null}}catch(e){if(/Signed out|refresh|JWT|invalid/i.test(e.message)){busy=false;return out('Please sign in again.')}toast(e.message)}busy=false;render()}
async function act(fn,args,msg){try{await rpc(fn,args);toast(msg);await load()}catch(e){toast(need11(e.message))}}
/* ----- helpers ----- */
const devMap=()=>{const m={};D.A.forEach(a=>a.devs.forEach(d=>{const k=devId(d);(m[k]=m[k]||[]).push(a)}));return m};
const sharedWith=a=>{const m=devMap(),s=new Map();a.devs.forEach(d=>m[devId(d)].forEach(x=>{if(x.id!=a.id)s.set(x.id,x)}));return[...s.values()]};
const flagged=a=>sharedWith(a).length>0;
const stTag=a=>({banned:'<span class="tag bad">Banned</span>',removed:'<span class="tag warn">Removed</span>',pending:'<span class="tag warn">Waiting</span>',noclub:'<span class="tag">No club</span>'}[a.st]||'<span class="tag ok">Active</span>');
const seenToday=a=>a.seen&&new Date(a.seen).toDateString()==new Date().toDateString();
const logRow=l=>`<div class="log"><i>${fmt(l.created_at)}</i><span><b>${esc(l.action)}</b> ${esc(l.detail||'')}<br><span class="sub">${esc(l.email||'System')}${l.club_name?', '+esc(l.club_name):''}</span></span></div>`;
/* ===== Kiibo Control 1.1.0 additions (everything above this line is unchanged apart from phone names) ===== */
let csel=null,cq='',cf='all',more='',X={sp:null,cfg:null,ann:null,pay:null,det:null};
const cap=s=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
const money=n=>'R'+Number(n||0).toLocaleString('en-ZA',{maximumFractionDigits:2});
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
const chk=id=>{const e=document.getElementById(id);return !!(e&&e.checked)};
const verOk=v=>/^\d+(\.\d+){1,3}$/.test(v);
const cmpv=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<4;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d}return 0};
const need11=m=>/could not find the function|schema cache|does not exist/i.test(m||'')?'Run supabase-11-control-additions.sql in Supabase first.':m;
async function rest(path){const r=await fetch(CLOUD.url+'/rest/v1/'+path,{headers:{apikey:CLOUD.key,Authorization:'Bearer '+await tok()}});const t=await r.text();let j;try{j=JSON.parse(t)}catch(e){j=t}if(!r.ok)throw new Error(j.message||t);return j}
async function clearFiles(list){const r=await fetch(CLOUD.url+'/storage/v1/object/club-media',{method:'DELETE',headers:{apikey:CLOUD.key,Authorization:'Bearer '+await tok(),'Content-Type':'application/json'},body:JSON.stringify({prefixes:list})});if(!r.ok)throw new Error('files')}
const spClub=id=>X.sp&&X.sp.clubs?X.sp.clubs.find(x=>x.id==id):null;
const spTags=id=>{const s=spClub(id);if(!s||!s.teams.length)return'';const m={};s.teams.forEach(t=>m[t.sport]=(m[t.sport]||0)+1);return Object.entries(m).map(([k,n])=>`<span class="tag">${esc(cap(k))}${n>1?' ×'+n:''}</span>`).join(' ')};
const spTotals=()=>{const m={};if(X.sp&&X.sp.clubs)X.sp.clubs.forEach(c=>c.teams.forEach(t=>{const o=m[t.sport]=m[t.sport]||{teams:0,players:0,fixtures:0,clubs:new Set()};o.teams++;o.players+=t.players;o.fixtures+=t.fixtures;o.clubs.add(c.id)}));return m};
async function openClub(id){csel=id;sel=null;X.det=null;render();try{X.det=await rpc('admin_club_detail',{p_club:id})}catch(e){X.det={id,error:need11(e.message)}}render()}
async function clubAct(fn,args,msg){try{await rpc(fn,args);toast(msg);await load();if(csel){try{X.det=await rpc('admin_club_detail',{p_club:csel})}catch(e){}}render()}catch(e){toast(need11(e.message))}}
async function openMore(k){more=k;render();try{
if(k=='upd'){const r=await rest('app_config?key=eq.app&select=value');X.cfg=(r[0]&&r[0].value)||{}}
if(k=='ann')X.ann=await rpc('admin_announcements');
if(k=='pay')X.pay=await rest('payments?select=club_id,amount,method,note,paid_on,paid_until&order=paid_on.desc&limit=300')
}catch(e){toast(need11(e.message))}render()}
async function delClub(){const c=D.C.find(x=>x.id==csel);if(!c)return;const del=chk('cd-acc');
const t=prompt('This deletes '+c.name+' for good: players, fixtures, squads, photos, videos, sport data and payments.'+(del?' Accounts that belong only to this club are deleted too.':' The accounts are kept.')+'\n\nType the club name to confirm.');
if(t===null)return;if(t.trim().toLowerCase()!==c.name.trim().toLowerCase())return toast('Name did not match. Nothing was deleted.');
try{let files=[];try{files=(await rpc('admin_club_files',{p_club:c.id}))||[]}catch(e){}
const r=await rpc('admin_delete_club',{p_club:c.id,p_delete_accounts:del});
let left=0;for(let i=0;i<files.length;i+=100){const part=files.slice(i,i+100);try{await clearFiles(part)}catch(e){left+=part.length}}
csel=null;X.det=null;toast('Deleted '+r.name+(r.accounts_deleted?' and '+r.accounts_deleted+' accounts':'')+(left?'. '+left+' files could not be cleared':''));await load()}catch(e){toast(need11(e.message))}}
function clubSheet(){const c=D.C.find(x=>x.id==csel);if(!c){csel=null;return $('#sh').classList.remove('on')}
const d=X.det&&X.det.id==csel?X.det:null,sp=spClub(c.id),el=$('#shc'),sc=el.scrollTop,base=c.until&&days(c.until)>0?c.until:todayS();
const plans=[...new Set(['trial','free','club','pro',c.plan])];
const teams=sp&&sp.teams.length?sp.teams.map(t=>`<div class="kv"><span>${esc(t.name)}</span><span><span class="tag">${esc(cap(t.sport))}</span> ${t.players} players, ${t.fixtures} fixtures</span></div>`).join(''):'<p class="sub">No team data yet.</p>';
let body;
if(!d)body='<p class="empty">Loading members and payments…</p>';
else if(d.error)body=`<p class="err">${esc(d.error)}</p>`;
else body=`<h2>Members</h2>${d.members.map(m=>`<div class="card" style="padding:10px"><div class="top"><b style="overflow:hidden;text-overflow:ellipsis">${esc(m.email||'')}</b><span class="tag ${m.status=='active'?'ok':'warn'}">${esc(m.status)}</span></div><div class="sub">${esc(m.name||'')} · seen ${fmt(m.last_seen)}</div><div class="btns" style="margin-top:8px"><select class="sel" data-role="${m.user_id}">${['owner','coach','media'].map(r=>`<option ${m.role==r?'selected':''}>${r}</option>`).join('')}</select>${m.status!='active'?`<button class="btn p" data-a="mset" data-v="${m.user_id}:active">Approve</button>`:''}${m.status!='removed'?`<button class="btn" data-a="mset" data-v="${m.user_id}:removed">Remove</button>`:''}</div></div>`).join('')||'<p class="sub">No members.</p>'}
<h2>Record a payment</h2><div class="f"><div class="two"><label>Amount (R)<input type="number" id="pa-amt" step="0.01" min="0"></label><label>Method<select class="sel" id="pa-method"><option>EFT</option><option>Cash</option><option>Other</option></select></label></div>
<div class="two"><label>Paid on<input type="date" id="pa-on" value="${todayS()}"></label><label>Paid until<input type="date" id="pa-until" value="${addDays(base,30)}"></label></div><label>Note<input type="text" id="pa-note"></label><div class="btns"><button class="btn p" data-a="paysave">Save payment</button></div></div>
<h2>Payment history</h2>${d.payments.map(p=>`<div class="kv"><span>${esc(p.paid_on||'')} · ${esc(p.method||'')}</span><span>${money(p.amount)} until ${esc(p.paid_until||'')}</span></div>`).join('')||'<p class="sub">No payments yet.</p>'}`;
el.innerHTML=`<h2 style="margin-top:0">${esc(c.name)}</h2><p class="sub">${esc((d&&d.location)||c.location||'')}</p>
<div class="kv"><span>Status</span><span>${c.active?(c.live?'Open':'Ended'):'Closed'}</span></div><div class="kv"><span>Plan</span><span>${esc(c.plan)}</span></div>
<div class="kv"><span>Open until</span><span>${c.until||'No end date'}</span></div><div class="kv"><span>Owner</span><span>${esc(c.owner||'None')}</span></div>
${d&&!d.error?`<div class="kv"><span>Join code</span><span>${esc(d.join_code||'')}</span></div><div class="kv"><span>Created</span><span>${fmt(d.created_at)}</span></div>`:''}
${sp?`<div class="kv"><span>Players</span><span>${sp.players}</span></div><div class="kv"><span>Fixtures</span><span>${sp.fixtures} (${sp.confirmed} confirmed)</span></div><div class="kv"><span>Training sessions</span><span>${sp.trainings}</span></div>`:''}
<h2>Teams and sports</h2>${teams}
<h2>Edit club</h2><div class="f"><label>Name<input type="text" id="ce-name" value="${esc(c.name)}"></label><label>Town<input type="text" id="ce-loc" value="${esc((d&&d.location)||c.location||'')}"></label><div class="btns"><button class="btn" data-a="ren">Save name</button></div>
<div class="two"><label>Plan<select class="sel" id="cs-plan">${plans.map(p=>`<option ${p==c.plan?'selected':''}>${esc(p)}</option>`).join('')}</select></label><label>Grace days<input type="number" id="cs-grace" min="0" max="60" value="${c.grace??0}"></label></div>
<label>Open until<input type="date" id="cs-until" value="${c.until||''}"></label><label class="ck"><input type="checkbox" id="cs-active" ${c.active?'checked':''}> Club switched on</label><div class="btns"><button class="btn" data-a="cset">Save plan and dates</button></div></div>
${body}
<h2>Delete club</h2><p class="sub">Removes the club and everything in it for good. This cannot be undone.</p><label class="ck"><input type="checkbox" id="cd-acc"> Also delete the accounts that belong only to this club</label>
<div class="btns"><button class="btn d" data-a="delclub">Delete this club</button></div><div class="btns"><button class="btn" data-a="cclose">Done</button></div>`;
$('#sh').classList.add('on');el.scrollTop=sc}
function moreView(){
if(!more)return `<h1>More</h1><p class="sub">Tools for running Kiibo Studios.</p><div style="height:12px"></div>${[['upd','App updates and maintenance','Push a new version or switch the app off for a while'],['ann','Announcements','Send a message to everyone, one club or one person'],['pay','Payments','What each club has paid'],['sp','Sports overview','Which club plays which sport']].map(x=>`<button class="row" data-a="more" data-v="${x[0]}"><div class="m"><b>${x[1]}</b><span>${x[2]}</span></div></button>`).join('')}<p class="sub" style="margin-top:18px">Kiibo Control v${KC_VER}</p>`;
const back=`<button class="btn" data-a="back" style="margin-bottom:10px">Back</button>`;
if(more=='upd'){const c=X.cfg;if(!c)return back+'<h1>App updates</h1><p class="empty">Loading…</p>';
return back+`<h1>App updates</h1><p class="sub">Controls what every phone running Kiibo Studios sees when it opens.</p>
<div class="card" style="margin-top:12px"><div class="kv"><span>Latest version</span><span>${esc(c.latest_version||'-')}</span></div><div class="kv"><span>Lowest allowed</span><span>${esc(c.min_version||'-')}</span></div><div class="kv"><span>Forced update</span><span>${c.force?'On':'Off'}</span></div><div class="kv"><span>Maintenance</span><span>${c.maintenance?'ON':'Off'}</span></div></div>
<div class="f"><label>Latest version<input type="text" id="u-lat" value="${esc(c.latest_version||'')}" placeholder="1.2.0"></label><label>Lowest version allowed<input type="text" id="u-min" value="${esc(c.min_version||'')}" placeholder="1.0.0"></label>
<label>Download link for the new APK<input type="text" id="u-url" value="${esc(c.update_url||'')}" placeholder="https://..."></label><label>Message shown on the update screen<input type="text" id="u-msg" value="${esc(c.message||'')}"></label>
<label class="ck"><input type="checkbox" id="u-force" ${c.force?'checked':''}> Force: phones older than the lowest version are blocked until they update</label>
<label class="ck"><input type="checkbox" id="u-mnt" ${c.maintenance?'checked':''}> Maintenance: everyone sees the maintenance screen</label><label>Maintenance message<input type="text" id="u-mmsg" value="${esc(c.maintenance_message||'')}"></label>
<div class="btns"><button class="btn p" data-a="pub">Publish</button><button class="btn ${c.maintenance?'p':'d'}" data-a="mtog">${c.maintenance?'Turn maintenance off':'Turn maintenance on'}</button></div></div>
<p class="sub">Phones show a banner when they are older than the latest version, and are blocked when older than the lowest version while Force is on.</p>`}
if(more=='ann'){const A=D.A,C=D.C,an=X.ann;
return back+`<h1>Announcements</h1><div class="f"><label>Title<input type="text" id="an-t" maxlength="120"></label><label>Message<textarea id="an-b" rows="3" maxlength="2000"></textarea></label>
<label>Send to<select class="sel" id="an-g"><option value="all">Everyone</option><option value="club">One club</option><option value="user">One person</option></select></label>
<label>Club (for one club)<select class="sel" id="an-c">${C.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
<label>Person (for one person)<select class="sel" id="an-u">${A.map(a=>`<option value="${a.id}">${esc(a.email)}</option>`).join('')}</select></label>
<label>Disappears after<select class="sel" id="an-e"><option value="0">Never</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
<div class="btns"><button class="btn p" data-a="annsend">Send</button></div></div><h2>Sent</h2>
${!an?'<p class="empty">Loading…</p>':an.map(a=>`<div class="card"><h3>${esc(a.title)}</h3><p class="sub">${a.target=='all'?'Everyone':a.target=='club'?esc(a.club_name||'A club'):esc(a.email||'One person')} · ${fmt(a.created_at)} · read by ${a.reads}</p><p style="margin:6px 0">${esc(a.body)}</p><button class="btn d" data-a="anndel" data-v="${a.id}">Delete</button></div>`).join('')||'<p class="empty">Nothing sent yet.</p>'}`}
if(more=='pay'){const P=X.pay;if(!P)return back+'<h1>Payments</h1><p class="empty">Loading…</p>';
const mo=todayS().slice(0,7),all=P.reduce((s,p)=>s+Number(p.amount||0),0),mth=P.filter(p=>(p.paid_on||'').startsWith(mo)).reduce((s,p)=>s+Number(p.amount||0),0),nm=id=>(D.C.find(c=>c.id==id)||{}).name||'Deleted club';
return back+`<h1>Payments</h1><div class="grid" style="margin-top:12px"><div class="st"><b>${money(mth)}</b><span>This month</span></div><div class="st"><b>${money(all)}</b><span>All recorded</span></div></div>
<h2>Latest</h2>${P.slice(0,25).map(p=>`<div class="card" style="padding:10px"><div class="top"><b>${esc(nm(p.club_id))}</b><b>${money(p.amount)}</b></div><span class="sub">${esc(p.paid_on||'')} · ${esc(p.method||'')} · until ${esc(p.paid_until||'')}${p.note?' · '+esc(p.note):''}</span></div>`).join('')||'<p class="empty">No payments recorded yet.</p>'}`}
if(more=='sp'){const T=spTotals(),ks=Object.keys(T);
if(!X.sp)return back+'<h1>Sports</h1><p class="empty">Sports data is not available. Run Kiibo Studios database part 10.</p>';
return back+`<h1>Sports</h1><div class="grid" style="margin-top:12px">${ks.map(k=>`<div class="st"><b>${T[k].teams}</b><span>${esc(cap(k))} teams, ${T[k].clubs.size} clubs, ${T[k].players} players</span></div>`).join('')||'<p class="empty">No teams yet.</p>'}</div>
<h2>By club</h2>${X.sp.clubs.map(c=>`<button class="row" data-a="club" data-v="${c.id}"><div class="m"><b>${esc(c.name)}</b><span>${c.teams.map(t=>esc(t.name)+' ('+esc(cap(t.sport))+')').join(', ')||'No teams'}</span></div></button>`).join('')}`}
return''}

const devId=s=>String(s).split('|')[0];
const devLab=s=>String(s).split('|').slice(1).join('|');
const devName=id=>{for(const a of D.A)for(const x of a.devs)if(devId(x)==id&&devLab(x))return devLab(x);return''};
const sportStrip=()=>{const T=spTotals(),ks=Object.keys(T);if(!ks.length)return'';return `<h2>Sports</h2><div class="grid">${ks.map(k=>`<div class="st"><b>${T[k].teams}</b><span>${esc(cap(k))} teams, ${T[k].clubs.size} clubs</span></div>`).join('')}</div>`};

/* ----- screens ----- */
function view(){
if(!SES)return `<div class="login"><h1>Kiibo Control</h1><p class="sub">Sign in with your platform owner account.</p><input type="email" id="em" placeholder="Email" autocomplete="email"><input type="password" id="pw" placeholder="Password" autocomplete="current-password"><button class="btn p" data-a="login">Sign in</button><p class="err">${esc(loginErr)}</p></div>`;
if(!D)return `<h1>Kiibo Control</h1><p class="empty">${busy?'Loading everything…':'Nothing loaded yet.'}</p>`;
const{A,C,L}=D;
if(tab=='home'){const f=Object.values(devMap()).filter(g=>g.length>1);
return `<div class="top"><div><h1>Kiibo Control</h1><p class="sub">${busy?'Updating…':'Live from your Supabase project'}</p></div><div style="display:flex;gap:6px"><button class="btn" data-a="refresh">Refresh</button><button class="btn" data-a="signout">Sign out</button></div></div>
<div class="grid" style="margin-top:14px"><div class="st"><b>${A.length}</b><span>Accounts</span></div><div class="st"><b>${C.filter(c=>c.active&&c.live).length}/${C.length}</b><span>Clubs open</span></div>
<div class="st"><b>${A.filter(seenToday).length}</b><span>Seen today</span></div><div class="st flag"><b>${f.length}</b><span>Phones with 2+ accounts</span></div></div>
${sportStrip()}<h2>Needs a look</h2>
${C.filter(c=>c.active&&c.until&&days(c.until)<=7).map(c=>`<div class="card"><h3>${esc(c.name)}</h3><span class="sub">${days(c.until)<0?'Past its end date':'Closes in '+days(c.until)+' days'}</span></div>`).join('')}
${A.filter(a=>a.st=='pending').map(a=>`<div class="card"><h3>Waiting to join</h3><span class="sub">${esc(a.email)} wants to join ${esc(a.clubName)}</span></div>`).join('')}
${f.map(g=>`<div class="card"><h3>One phone, ${g.length} accounts</h3><span class="sub">${g.map(a=>esc(a.email)).join(' and ')}</span></div>`).join('')}
<h2>Latest activity</h2>${L.slice(0,5).map(logRow).join('')||'<p class="empty">No activity yet.</p>'}`}
if(tab=='acc'){const R=A.filter(a=>(fl=='all'||(fl=='same'&&flagged(a))||(fl=='bad'&&(a.st=='banned'||a.st=='removed'))||(fl=='wait'&&a.st=='pending'))&&(a.email+a.name).toLowerCase().includes(q.toLowerCase()));
return `<h1>Accounts</h1><input type="search" id="q" placeholder="Search email or name" value="${esc(q)}">
<div class="chips">${[['all','Everyone'],['same','Same phone'],['wait','Waiting'],['bad','Banned or removed']].map(x=>`<button class="chip ${fl==x[0]?'on':''}" data-a="fl" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>
${R.map(a=>`<button class="row" data-a="open" data-v="${a.id}"><div class="av">${esc(init(a.name))}</div><div class="m"><b>${esc(a.email)}</b><span>${esc(a.name)}, ${esc(a.clubName)}</span></div>${flagged(a)?'<span class="tag warn">Shared phone</span>':''}${stTag(a)}</button>`).join('')||'<p class="empty">No accounts match.</p>'}`}
if(tab=='clubs'){const T=Object.keys(spTotals()),R=C.filter(c=>(cf=='all'||(cf=='closed'&&!(c.active&&c.live))||(cf.slice(0,2)=='s:'&&(spClub(c.id)||{teams:[]}).teams.some(t=>t.sport==cf.slice(2))))&&(c.name+' '+(c.owner||'')).toLowerCase().includes(cq.toLowerCase()));
return `<h1>Clubs</h1><p class="sub">Open a club to see its sports, members and payments, or to remove it.</p><input type="search" id="cq" placeholder="Search clubs" value="${esc(cq)}"><div class="chips">${[['all','All'],...T.map(k=>['s:'+k,cap(k)]),['closed','Closed or ended']].map(x=>`<button class="chip ${cf==x[0]?'on':''}" data-a="cf" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>`+(R.map(c=>{const d=c.until?days(c.until):null,sp=spClub(c.id);return `<div class="card"><div class="top"><h3>${esc(c.name)}</h3><span class="tag ${c.active&&c.live?'ok':'bad'}">${c.active?(c.live?'Open':'Ended'):'Closed'}</span></div>
<p class="sub">${esc(c.plan)} plan, ${c.members} members${c.owner?', owner '+esc(c.owner):''}. ${c.until?(d>=0?`Open until ${c.until} (${d} days left)`:`Ended ${-d} days ago`):'No end date'}</p>
${sp?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${spTags(c.id)}</div><p class="sub">${sp.players} players, ${sp.fixtures} fixtures, ${sp.trainings} training sessions</p>`:''}
<div class="btns"><button class="btn" data-a="add" data-v="${c.id}:7">Add 7 days</button><button class="btn" data-a="add" data-v="${c.id}:30">Add 30 days</button>
<button class="btn ${c.active?'d':'p'}" data-a="tog" data-v="${c.id}">${c.active?'Close club':'Reopen club'}</button><button class="btn" data-a="club" data-v="${c.id}">Open club</button></div></div>`}).join('')||'<p class="empty">No clubs match.</p>')}
if(tab=='dev'){const g=Object.entries(devMap()).sort((a,b)=>b[1].length-a[1].length);
return `<h1>Phones</h1><p class="sub">Each phone gets a private ID. Accounts that share one are linked here.</p><div style="height:12px"></div>`+(g.map(([d,l])=>`<div class="card dev ${l.length>1?'f':''}"><div class="top"><h3>${esc(devName(d)||d)}</h3><span class="tag ${l.length>1?'warn':''}">${l.length} account${l.length>1?'s':''}</span></div>${l.map(a=>`<button class="row" style="margin:8px 0 0" data-a="open" data-v="${a.id}"><div class="m"><b>${esc(a.email)}</b><span>${esc(a.clubName)}</span></div>${stTag(a)}</button>`).join('')}</div>`).join('')||'<p class="empty">No phones recorded yet. They appear once people open the updated Kiibo Studios app.</p>')}
if(tab=='more')return moreView();
return `<h1>Activity</h1><p class="sub">The latest 100 things that happened, newest first.</p><div style="height:8px"></div>`+(L.map(logRow).join('')||'<p class="empty">No activity yet.</p>')}
function sheet(){const s=$('#sh'),a=D&&sel&&D.A.find(x=>x.id==sel);if(!a){if(csel&&D)return clubSheet();s.classList.remove('on');return}
const sh=sharedWith(a);
$('#shc').innerHTML=`<h2 style="margin-top:0">${esc(a.name)}</h2>
<div class="kv"><span>Email</span><span>${esc(a.email)}</span></div><div class="kv"><span>Club</span><span>${esc(a.clubName)}</span></div>
<div class="kv"><span>Role</span><span>${esc(a.role)}</span></div><div class="kv"><span>Last seen</span><span>${fmt(a.seen)}</span></div>
<div class="kv"><span>Phones</span><span>${a.devs.length?esc(a.devs.map(x=>devLab(x)||devId(x)).join(', ')):'None recorded'}</span></div><div class="kv"><span>Status</span><span>${a.st}</span></div>
${sh.length?`<p class="sub" style="margin-top:12px">Same phone as: ${sh.map(x=>esc(x.email)).join(', ')}</p>`:''}
<div class="btns"><button class="btn d" data-a="ban" data-v="${a.id}">${a.st=='banned'?'Unban account':'Ban account'}</button>${a.club?`<button class="btn" data-a="rem" data-v="${a.id}">Remove from club</button>`:''}</div>
<div class="btns"><button class="btn" data-a="pw" data-v="${a.id}">Set new password</button><button class="btn d" data-a="del" data-v="${a.id}">Delete account</button></div>
${a.club?`<div class="btns">${a.st=='pending'?`<button class="btn p" data-a="appr" data-v="${a.id}">Approve to join</button>`:''}<button class="btn" data-a="club" data-v="${a.club}">Open club</button></div>`:''}
<div class="btns"><button class="btn" data-a="close">Done</button></div>`;s.classList.add('on')}
function render(){$('#app').innerHTML=view();$('#nav').innerHTML=SES&&D?TABS.map(t=>`<button class="${tab==t[0]?'on':''}" data-a="tab" data-v="${t[0]}"><svg viewBox="0 0 24 24">${icons[t[0]]}</svg>${t[1]}</button>`).join(''):'';sheet();
const i=$('#q');if(i)i.oninput=e=>{q=e.target.value;const p=e.target.selectionStart;render();const n=$('#q');n.focus();n.setSelectionRange(p,p)};const j=$('#cq');if(j)j.oninput=e=>{cq=e.target.value;const p=e.target.selectionStart;render();const n=$('#cq');n.focus();n.setSelectionRange(p,p)}}
document.addEventListener('click',e=>{
if(e.target.id=='sh'){sel=null;csel=null;return render()}
const b=e.target.closest('[data-a]');if(!b)return;const v=b.dataset.v,a=b.dataset.a;
if(a=='login')return login();
if(a=='tab'){tab=v;if(v=='more')more='';window.scrollTo(0,0)}
else if(a=='fl')fl=v;
else if(a=='open')sel=v;
else if(a=='close')sel=null;
else if(a=='refresh')return load();
else if(a=='signout')return out();
else if(a=='ban'){const x=D.A.find(y=>y.id==v),on=x.st!='banned';if(!confirm((on?'Ban ':'Unban ')+x.email+'?'+(on?' They will be signed out of every phone.':'')))return;return act('admin_set_ban',{p_user:v,p_ban:on},on?'Account banned':'Account unbanned')}
else if(a=='rem'){const x=D.A.find(y=>y.id==v);if(!confirm('Remove '+x.email+' from '+x.clubName+'?'))return;sel=null;return act('admin_remove_member',{p_user:v,p_club:x.club},'Removed from club')}
else if(a=='pw'){const x=D.A.find(y=>y.id==v),p=prompt('New password for '+x.email+' (at least 6 characters). They will be signed out everywhere.');if(!p)return;if(p.length<6)return toast('Use at least 6 characters');return act('admin_set_password',{p_user:v,p_password:p},'Password changed')}
else if(a=='del'){const x=D.A.find(y=>y.id==v);if(prompt('This deletes '+x.email+' for good'+(x.role=='owner'?'. They own '+x.clubName+', which will be left without an owner':'')+'. Type DELETE to confirm.')!=='DELETE')return;sel=null;return act('admin_delete_user',{p_user:v},'Account deleted')}
else if(a=='tog'){const c=D.C.find(y=>y.id==v);if(c.active&&!confirm('Close '+c.name+'? Everyone in the club loses access.'))return;return act('admin_set_club',{p_club:v,p_active:!c.active,p_plan:c.plan,p_paid_until:c.until,p_grace:c.grace},c.active?'Club closed':'Club reopened')}
else if(a=='add'){const[id,n]=v.split(':'),c=D.C.find(y=>y.id==id),base=c.until&&days(c.until)>0?c.until:todayS(),to=addDays(base,+n);return act('admin_set_club',{p_club:id,p_active:c.active,p_plan:c.plan,p_paid_until:to,p_grace:c.grace},'Open until '+to)}
else if(a=='club'){openClub(v);return}
else if(a=='cclose'){csel=null;X.det=null}
else if(a=='cf')cf=v;
else if(a=='more'){openMore(v);return}
else if(a=='back'){more=''}
else if(a=='appr'){const x=D.A.find(y=>y.id==v);sel=null;return act('admin_set_member',{p_user:v,p_club:x.club,p_role:x.role,p_status:'active'},'Approved')}
else if(a=='mset'){const[u,st]=v.split(':'),m=X.det.members.find(y=>y.user_id==u);if(st=='removed'&&!confirm('Remove '+m.email+' from this club?'))return;return clubAct('admin_set_member',{p_user:u,p_club:csel,p_role:m.role,p_status:st},st=='active'?'Approved':'Removed')}
else if(a=='ren')return clubAct('admin_update_club',{p_club:csel,p_name:val('ce-name'),p_location:val('ce-loc')},'Club updated');
else if(a=='cset')return clubAct('admin_set_club',{p_club:csel,p_active:chk('cs-active'),p_plan:val('cs-plan'),p_paid_until:val('cs-until')||null,p_grace:+val('cs-grace')||0},'Saved');
else if(a=='paysave'){const amt=+val('pa-amt'),until=val('pa-until'),c=D.C.find(y=>y.id==csel);if(!(amt>0))return toast('Enter the amount');if(!until)return toast('Choose a date');if(!confirm('Record '+money(amt)+' for '+c.name+'? The club will be switched on until '+until+'.'))return;return clubAct('admin_record_payment',{p_club:csel,p_amount:amt,p_method:val('pa-method'),p_note:val('pa-note'),p_paid_on:val('pa-on')||null,p_paid_until:until},'Payment saved')}
else if(a=='delclub'){delClub();return}
else if(a=='pub'){const lat=val('u-lat').trim(),min=val('u-min').trim(),url=val('u-url').trim(),force=chk('u-force'),mnt=chk('u-mnt');
if(!verOk(lat)||!verOk(min))return toast('Versions look like 1.2.0');if(cmpv(min,lat)>0)return toast('Lowest version cannot be above the latest');
if(force&&!url&&!confirm('There is no download link, so blocked phones have nowhere to update. Continue?'))return;
if(mnt&&!confirm('Maintenance is on. Everybody will see the maintenance screen. Continue?'))return;
return pubUpd({p_min:min,p_latest:lat,p_url:url,p_message:val('u-msg'),p_force:force,p_maintenance:mnt,p_maintenance_message:val('u-mmsg')},'Update published')}
else if(a=='mtog'){const c=X.cfg||{},on=!c.maintenance;if(on&&!confirm('Turn maintenance on? Everybody sees the maintenance screen until you turn it off.'))return;return pubUpd({p_min:c.min_version||'1.0.0',p_latest:c.latest_version||'1.0.0',p_url:c.update_url||'',p_message:c.message||'',p_force:!!c.force,p_maintenance:on,p_maintenance_message:val('u-mmsg')||c.maintenance_message||''},on?'Maintenance on':'Maintenance off')}
else if(a=='annsend'){const t=val('an-t').trim(),b2=val('an-b').trim(),g=val('an-g'),n=+val('an-e');if(!t||!b2)return toast('Add a title and a message');if(!confirm('Send "'+t+'" to '+(g=='all'?'everyone':g=='club'?'this club':'this person')+'?'))return;
return annDo('admin_send_announcement',{p_title:t,p_body:b2,p_target:g,p_club:g=='club'?val('an-c'):null,p_user:g=='user'?val('an-u'):null,p_expires:n?new Date(Date.now()+n*864e5).toISOString():null},'Sent')}
else if(a=='anndel'){if(!confirm('Delete this announcement?'))return;return annDo('admin_delete_announcement',{p_id:v},'Deleted')}
render()});
async function pubUpd(args,msg){try{await rpc('admin_publish_update',args);toast(msg);await openMore('upd')}catch(e){toast(need11(e.message))}}
async function annDo(fn,args,msg){try{await rpc(fn,args);toast(msg);await openMore('ann')}catch(e){toast(need11(e.message))}}
document.addEventListener('change',e=>{const t=e.target,u=t&&t.dataset&&t.dataset.role;if(!u)return;const m=X.det&&X.det.members&&X.det.members.find(y=>y.user_id==u);if(!m)return;if(!confirm('Make '+m.email+' a '+t.value+'?'))return render();clubAct('admin_set_member',{p_user:u,p_club:csel,p_role:t.value,p_status:m.status},'Role changed')});
document.addEventListener('keydown',e=>{if(e.key=='Enter'&&!SES&&e.target.id=='pw')login()});
render();if(SES)load();
