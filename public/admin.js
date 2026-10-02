const $=id=>document.getElementById(id);
let D=null,editingMonitor=null,editingStatus=null,tabName="monitors";

async function api(url,options={}){
  const res=await fetch(url,{...options,cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Erreur serveur");
  return data;
}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function toast(message,bad=false){
  const el=document.createElement("div");el.className="toast"+(bad?" bad":"");el.textContent=message;document.body.appendChild(el);
  setTimeout(()=>el.remove(),2600);
}
function selectedMonitors(containerId){
  return [...document.querySelectorAll("#"+containerId+" input:checked")].map(x=>x.value);
}
function checkboxes(id,monitors,selected=[]){
  $(id).innerHTML=monitors.map(m=>"<label><input type='checkbox' value='"+esc(m.id)+"' "+(selected.includes(m.id)?"checked":"")+">"+esc(m.name)+"</label>").join("")||"<span class='muted'>Aucun monitor.</span>";
}
function setTab(name){
  tabName=name;
  document.querySelectorAll(".tab-panel").forEach(x=>x.hidden=x.id!==name);
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
  const titles={monitors:"Monitors",status:"Status Pages",maintenance:"Maintenance",incidents:"Incidents",settings:"Paramètres"};
  $("pageHeading").textContent=titles[name]||"Administration";
}
async function boot(){
  try{
    D=await api("/api/admin");
    $("loginView").hidden=true;$("panel").hidden=false;
    renderAll();await loadSystem();
  }catch{
    $("loginView").hidden=false;$("panel").hidden=true;
  }
}
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();$("loginError").hidden=true;
  try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});$("password").value="";await boot();}
  catch(err){$("loginError").textContent=err.message;$("loginError").hidden=false;}
});
async function logout(){await api("/api/logout",{method:"POST"});location.reload();}
$("logoutBtn").addEventListener("click",logout);$("topLogout").addEventListener("click",logout);
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

function renderAll(){renderMonitors();renderStatus();renderMaintenance();renderIncidents();renderSettings();}
function renderMonitors(){
  const all=D.monitors.length,up=D.monitors.filter(m=>{const h=(D._history?.[m.id]||[]);return h.at(-1)?.up}).length;
  const down=Math.max(0,all-up);
  $("monitorStats").innerHTML="<div class='stat'><small>Total</small><b>"+all+"</b></div><div class='stat'><small>Opérationnels</small><b class='good'>"+up+"</b></div><div class='stat'><small>Incidents</small><b class='"+(down?"bad":"good")+"'>"+down+"</b></div>";
  $("monitorList").innerHTML=all?D.monitors.map(m=>{
    const maintenance=D.maintenance.some(x=>x.enabled&&x.start<=Date.now()&&Date.now()<=x.end&&(x.monitors||[]).includes(m.id));
    return "<article class='monitor "+(maintenance?"maintenance":"")+"'><div class='monitor-main'><div class='monitor-name'><i class='status-dot'></i><div><b>"+esc(m.name)+"</b><small>"+esc(m.url)+"</small></div></div><div class='monitor-actions'><button class='icon-btn' data-edit='"+esc(m.id)+"'>Modifier</button><button class='icon-btn danger' data-delete='"+esc(m.id)+"'>Supprimer</button></div></div><div class='monitor-meta'><span>"+esc(m.type.toUpperCase())+"</span><span>Toutes les "+m.interval+"s</span><span>"+m.timeout+" ms timeout</span>"+(m.tags||[]).map(t=>"<span>"+esc(t)+"</span>").join("")+"<span class='status-pill "+(maintenance?"warn":"")+"'>"+(maintenance?"Maintenance":"Surveillance active")+"</span></div></article>";
  }).join(""):"<div class='empty'>Aucun monitor configuré.<br><br>Ajoutez votre premier service pour commencer.</div>";
  document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openMonitor(b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteMonitor(b.dataset.delete)));
}
function openMonitor(id=null){
  editingMonitor=D.monitors.find(m=>m.id===id)||null;
  const m=editingMonitor||{};
  $("monitorEditor").hidden=false;
  $("monitorEditor").innerHTML="<div class='hero-row'><div><h3>"+(editingMonitor?"Modifier le monitor":"Nouveau monitor")+"</h3><p>Configurez les paramètres de surveillance.</p></div><button class='ghost' id='closeMonitor'>Fermer</button></div><div class='form-grid'><label class='field'>Nom<input id='mname' value='"+esc(m.name||"")+"' placeholder='Site Craftpick'></label><label class='field'>Type<select id='mtype'><option value='http'>HTTP / HTTPS</option><option value='keyword'>HTTP + Keyword</option><option value='tcp'>TCP</option><option value='ping'>Ping</option></select></label><label class='field full'>URL<input id='murl' value='"+esc(m.url||"")+"' placeholder='https://craftpick.fr'></label><label class='field'>Intervalle (secondes)<input id='minterval' type='number' min='10' value='"+(m.interval||60)+"'></label><label class='field'>Timeout (ms)<input id='mtimeout' type='number' min='1000' value='"+(m.timeout||5000)+"'></label><label class='field full'>Mot-clé attendu <input id='mkeyword' value='"+esc(m.keyword||"")+"' placeholder='Uniquement pour HTTP + Keyword'></label><label class='field full'>Tags<input id='mtags' value='"+esc((m.tags||[]).join(", "))+"' placeholder='Web, Minecraft, API'></label></div><div class='form-actions'><button class='primary' id='saveMonitor'>Enregistrer</button><button class='secondary' id='cancelMonitor'>Annuler</button></div>";
  $("mtype").value=m.type||"http";
  $("closeMonitor").onclick=closeMonitor;$("cancelMonitor").onclick=closeMonitor;$("saveMonitor").onclick=saveMonitor;
  $("mname").focus();
}
function closeMonitor(){editingMonitor=null;$("monitorEditor").hidden=true;}
async function saveMonitor(){
  try{
    await api("/api/admin/monitor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editingMonitor?.id,name:$("mname").value,url:$("murl").value,type:$("mtype").value,keyword:$("mkeyword").value,interval:+$("minterval").value,timeout:+$("mtimeout").value,tags:$("mtags").value.split(",").map(x=>x.trim()).filter(Boolean)})});
    D=await api("/api/admin");renderAll();closeMonitor();toast("Monitor enregistré");
  }catch(e){toast(e.message,true);}
}
async function deleteMonitor(id){if(!confirm("Supprimer ce monitor et son historique ?"))return;try{await api("/api/admin/monitor/"+encodeURIComponent(id),{method:"DELETE"});D=await api("/api/admin");renderAll();toast("Monitor supprimé");}catch(e){toast(e.message,true);}}
$("newMonitorBtn").addEventListener("click",()=>openMonitor());
$("checkBtn").addEventListener("click",async()=>{try{$("checkBtn").disabled=true;await api("/api/admin/check",{method:"POST"});D=await api("/api/admin");renderAll();toast("Vérification terminée");}catch(e){toast(e.message,true);}finally{$("checkBtn").disabled=false;}});

function renderStatus(){
  $("statusList").innerHTML=D.statusPages.length?D.statusPages.map(p=>"<div class='list-card'><div><b>"+esc(p.title)+"</b><small>/status/"+esc(p.slug)+" · "+p.monitors.length+" monitors</small></div><button class='icon-btn' data-status='"+esc(p.id)+"'>Modifier</button></div>").join(""):"<div class='empty'>Aucune status page.</div>";
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>openStatus(b.dataset.status));
  if(!editingStatus&&D.statusPages[0])openStatus(D.statusPages[0].id);
}
function openStatus(id=null){
  editingStatus=D.statusPages.find(p=>p.id===id)||null;
  const p=editingStatus||{title:D.siteName,slug:"status",description:"État en temps réel de nos services.",monitors:[]};
  $("statusEditor").innerHTML="<h3>"+(editingStatus?"Modifier la page":"Nouvelle status page")+"</h3><label>Titre<input id='spTitle' value='"+esc(p.title)+"'></label><label>Slug<input id='spSlug' value='"+esc(p.slug)+"'></label><label>Description<input id='spDesc' value='"+esc(p.description)+"'></label><label>Monitors</label><div id='spMonitors' class='check-list'></div><button class='primary' id='saveStatus'>Enregistrer</button>";
  checkboxes("spMonitors",D.monitors,p.monitors||[]);$("saveStatus").onclick=saveStatus;
}
async function saveStatus(){
  try{await api("/api/admin/status-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editingStatus?.id,title:$("spTitle").value,slug:$("spSlug").value,description:$("spDesc").value,monitors:selectedMonitors("spMonitors")})});D=await api("/api/admin");editingStatus=null;renderStatus();toast("Status page enregistrée");}catch(e){toast(e.message,true);}
}
$("newStatusBtn").addEventListener("click",()=>openStatus());

function renderMaintenance(){
  $("maintenanceList").innerHTML=D.maintenance.length?D.maintenance.map(x=>"<div class='list-card'><div><b>"+esc(x.title)+"</b><small>"+new Date(x.start).toLocaleString("fr-FR")+" → "+new Date(x.end).toLocaleString("fr-FR")+"</small></div><button class='icon-btn danger' data-maint='"+esc(x.id)+"'>Supprimer</button></div>").join(""):"<div class='empty'>Aucune maintenance planifiée.</div>";
  document.querySelectorAll("[data-maint]").forEach(b=>b.onclick=async()=>{await api("/api/admin/maintenance/"+encodeURIComponent(b.dataset.maint),{method:"DELETE"});D=await api("/api/admin");renderAll();toast("Maintenance supprimée");});
}
function openMaintenance(){
  const start=new Date(Date.now()+300000),end=new Date(Date.now()+3900000);
  $("maintenanceEditor").innerHTML="<h3>Planifier une maintenance</h3><div class='form-grid'><label class='field'>Titre<input id='mtitle' value='Maintenance planifiée'></label><span></span><label class='field'>Début<input id='mstart' type='datetime-local' value='"+localDate(start)+"'></label><label class='field'>Fin<input id='mend' type='datetime-local' value='"+localDate(end)+"'></label></div><label>Monitors</label><div id='maintMonitors' class='check-list'></div><button class='primary' id='saveMaintenance'>Planifier</button>";
  checkboxes("maintMonitors",D.monitors,[]);$("saveMaintenance").onclick=saveMaintenance;
}
function localDate(d){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16);}
async function saveMaintenance(){
  try{await api("/api/admin/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:$("mtitle").value,start:new Date($("mstart").value).getTime(),end:new Date($("mend").value).getTime(),monitors:selectedMonitors("maintMonitors"),enabled:true})});D=await api("/api/admin");renderAll();toast("Maintenance planifiée");}catch(e){toast(e.message,true);}
}
$("newMaintenanceBtn").addEventListener("click",openMaintenance);

function renderIncidents(){
  $("incidentList").innerHTML=D.incidents.length?D.incidents.slice().reverse().map(x=>"<div class='list-card incident-card "+esc(x.severity)+" "+(x.resolved?"resolved":"")+"'><div><b>"+esc(x.title)+"</b><small>"+esc(x.severity.toUpperCase())+" · "+(x.resolved?"Résolu":"Actif")+" · "+new Date(x.created||Date.now()).toLocaleString("fr-FR")+"</small></div>"+(x.resolved?"":"<button class='icon-btn' data-resolve='"+esc(x.id)+"'>Résoudre</button>")+"</div>").join(""):"<div class='empty'>Aucun incident.</div>";
  document.querySelectorAll("[data-resolve]").forEach(b=>b.onclick=async()=>{await api("/api/admin/incident/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.dataset.resolve})});D=await api("/api/admin");renderAll();toast("Incident résolu");});
}
function openIncident(){
  $("incidentEditor").innerHTML="<h3>Déclarer un incident</h3><label>Titre<input id='ititle' placeholder='Dégradation du réseau'></label><label>Sévérité<select id='iseverity'><option value='minor'>Mineur</option><option value='major'>Majeur</option><option value='critical'>Critique</option></select></label><label>Message<textarea id='imessage' placeholder='Décrivez le problème...'></textarea></label><label>Monitors concernés</label><div id='incMonitors' class='check-list'></div><button class='primary' id='saveIncident'>Publier</button>";
  checkboxes("incMonitors",D.monitors,[]);$("saveIncident").onclick=saveIncident;
}
async function saveIncident(){
  try{await api("/api/admin/incident",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:$("ititle").value,message:$("imessage").value,severity:$("iseverity").value,monitors:selectedMonitors("incMonitors")})});D=await api("/api/admin");renderAll();toast("Incident publié");}catch(e){toast(e.message,true);}
}
$("newIncidentBtn").addEventListener("click",openIncident);

function renderSettings(){$("site").value=D.siteName;$("webhook").value="";}
async function loadSystem(){
  try{const s=await api("/api/system");const values=[["CPU",s.cpu+" cœurs"],["RAM",s.ram.percent+"% utilisée"],["Disque",s.disk?.percent??"—"+"% utilisé"],["Température",s.temp==null?"—":s.temp+" °C"],["Node",s.node],["Uptime",Math.floor(s.uptime/3600)+" h"]];$("system").innerHTML=values.map(x=>"<div class='system-item'><small>"+esc(x[0])+"</small><b>"+esc(x[1])+"</b></div>").join("");}catch{$("system").textContent="Impossible de récupérer les informations système.";}
}
$("saveSettingsBtn").addEventListener("click",async()=>{try{await api("/api/admin/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({siteName:$("site").value,discordWebhook:$("webhook").value})});D=await api("/api/admin");renderSettings();toast("Paramètres sauvegardés");}catch(e){toast(e.message,true);}});

setTab("monitors");boot();