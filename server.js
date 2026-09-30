const http=require("http");
const fs=require("fs");
const os=require("os");
const path=require("path");
const crypto=require("crypto");
const net=require("net");

const HOST=process.env.HOST||"0.0.0.0";
const PORT=Number(process.env.PORT||3000);
const PUBLIC_DIR=path.join(__dirname,"public");
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"data");
const CONFIG_FILE=path.join(DATA_DIR,"config.json");
const HISTORY_FILE=path.join(DATA_DIR,"history.json");
const SESSION_TTL=24*60*60*1000;
const sessions=new Map();
fs.mkdirSync(DATA_DIR,{recursive:true});

const DEFAULT_CONFIG={siteName:"Craftpick Status",monitors:[],notifications:{discordWebhook:""}};
function load(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
let config=load(CONFIG_FILE,DEFAULT_CONFIG);
if(!config.monitors)config.monitors=[];
if(!config.notifications)config.notifications={discordWebhook:""};
let history=load(HISTORY_FILE,{});
function saveConfig(){fs.writeFileSync(CONFIG_FILE,JSON.stringify(config,null,2))}
function saveHistory(){fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))}
function hashPassword(password){return crypto.scryptSync(password,"craftpick-status",64).toString("hex")}
const ADMIN_HASH=process.env.ADMIN_PASSWORD_HASH||hashPassword(process.env.ADMIN_PASSWORD||"");
if(!process.env.ADMIN_PASSWORD_HASH&&!process.env.ADMIN_PASSWORD)console.warn("Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH before exposing the panel.");

function safeEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function cookieSession(req){const m=(req.headers.cookie||"").match(/(?:^|; )session=([^;]+)/);return m?m[1]:null}
function isAdmin(req){const token=cookieSession(req),s=token&&sessions.get(token);if(!s)return false;if(s< Date.now()){sessions.delete(token);return false}return true}
function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data))}
function send(res,status,body,type="text/plain; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body)}
function body(req){return new Promise((resolve,reject)=>{let b="";req.on("data",c=>{b+=c;if(b.length>1e6)req.destroy()});req.on("end",()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on("error",reject)})}
function readFileSafe(file){try{return fs.readFileSync(file,"utf8").trim()}catch{return null}}
function systemStatus(cb){const cpus=os.cpus(),total=os.totalmem(),free=os.freemem(),raw=readFileSafe("/sys/class/thermal/thermal_zone0/temp"),temperature=raw?Number(raw)/1000:null;require("child_process").execFile("df",["-k","/"],{timeout:1500},(e,out)=>{let disk=null;if(!e){const p=out.trim().split("\n").pop().trim().split(/\s+/);disk={percent:parseInt(p[4],10)||0,totalKb:+p[1]||0,usedKb:+p[2]||0,freeKb:+p[3]||0}}cb({hostname:os.hostname(),platform:process.platform,arch:process.arch,node:process.version,uptime:os.uptime(),cpuCount:cpus.length,cpuModel:cpus[0]?.model||"Unknown",memory:{total,free,used:total-free,percent:total?Math.round((total-free)/total*1000)/10:0},temperature:Number.isFinite(temperature)?Math.round(temperature*10)/10:null,disk,network:Object.entries(os.networkInterfaces()).flatMap(([name,es])=>(es||[]).filter(e=>!e.internal&&e.family==="IPv4").map(e=>({name,address:e.address})))})})}

function publicMonitors(){return config.monitors.map(m=>({id:m.id,name:m.name,url:m.url,type:m.type,interval:m.interval,history:(history[m.id]||[]).slice(-90)}))}
function checkMonitor(m){return new Promise(resolve=>{const start=Date.now();if(m.type==="tcp"){const u=new URL(m.url);const s=net.createConnection({host:u.hostname,port:Number(u.port||80),timeout:5000},()=>{s.destroy();resolve({up:true,latency:Date.now()-start})});s.on("error",()=>{s.destroy();resolve({up:false,latency:null})});s.on("timeout",()=>{s.destroy();resolve({up:false,latency:null})});return}
let u;try{u=new URL(m.url)}catch{return resolve({up:false,latency:null})}
const mod=u.protocol==="https:"?require("https"):require("http");
const r=mod.request(u,{method:"GET",timeout:5000,headers:{"User-Agent":"CraftpickStatus/1.0"}},res=>{res.resume();resolve({up:res.statusCode>=200&&res.statusCode<400,latency:Date.now()-start,status:res.statusCode})});
r.on("error",()=>resolve({up:false,latency:null}));r.on("timeout",()=>{r.destroy();resolve({up:false,latency:null})});r.end()})}
async function runChecks(){for(const m of config.monitors){const result=await checkMonitor(m);const item={time:Date.now(),up:result.up,latency:result.latency,status:result.status||null};history[m.id]=[...(history[m.id]||[]),item].slice(-5000);if(!result.up)await notifyDown(m)}saveHistory()}
const notified=new Map();
async function notifyDown(m){if(!config.notifications.discordWebhook||notified.get(m.id))return;notified.set(m.id,Date.now());try{const u=new URL(config.notifications.discordWebhook);const data=JSON.stringify({content:"🔴 **"+m.name+"** est actuellement indisponible sur Craftpick Status."});const mod=u.protocol==="https:"?require("https"):require("http");const r=mod.request(u,{method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)}},x=>x.resume());r.on("error",()=>{});r.write(data);r.end()}catch{}}
function publicSummary(){return config.monitors.map(m=>{const h=history[m.id]||[],last=h[h.length-1],recent=h.slice(-100),up=recent.filter(x=>x.up).length;return {...m,history:recent,online:!!last?.up,latency:last?.latency||null,uptime:recent.length?Math.round(up/recent.length*10000)/100:100,lastCheck:last?.time||null}})}
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml"};
const server=http.createServer(async(req,res)=>{
const url=new URL(req.url,"http://localhost");
if(req.method==="POST"&&url.pathname==="/api/login"){try{const b=await body(req);if(!safeEqual(hashPassword(String(b.password||"")),ADMIN_HASH))return json(res,401,{error:"Identifiants invalides"});const token=crypto.randomBytes(32).toString("hex");sessions.set(token,Date.now()+SESSION_TTL);res.writeHead(200,{"Content-Type":"application/json","Set-Cookie:" : ""});res.setHeader("Set-Cookie",`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);return json(res,200,{ok:true})}catch{return json(res,400,{error:"Requête invalide"})}}
if(req.method==="POST"&&url.pathname==="/api/logout"){const t=cookieSession(req);if(t)sessions.delete(t);res.setHeader("Set-Cookie","session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");return json(res,200,{ok:true})}
if(url.pathname==="/api/public")return json(res,200,{siteName:config.siteName,monitors:publicSummary(),timestamp:Date.now()});
if(url.pathname==="/api/system"){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});return systemStatus(s=>json(res,200,s))}
if(url.pathname==="/api/admin"){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});return json(res,200,{siteName:config.siteName,monitors:config.monitors,notifications:{discordWebhook:config.notifications.discordWebhook?"configured":""}})}
if(req.method==="POST"&&url.pathname==="/api/admin/monitor"){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});try{const b=await body(req);if(!b.name||!b.url)return json(res,400,{error:"Nom et URL requis"});const m={id:b.id||crypto.randomUUID(),name:String(b.name).slice(0,80),url:String(b.url).slice(0,500),type:b.type==="tcp"?"tcp":"http",interval:Math.max(10,Math.min(3600,Number(b.interval)||30))};const i=config.monitors.findIndex(x=>x.id===m.id);if(i>=0)config.monitors[i]=m;else config.monitors.push(m);saveConfig();return json(res,200,m)}catch{return json(res,400,{error:"Requête invalide"})}}
if(req.method==="DELETE"&&url.pathname.startsWith("/api/admin/monitor/")){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});const id=url.pathname.split("/").pop();config.monitors=config.monitors.filter(m=>m.id!==id);delete history[id];saveConfig();saveHistory();return json(res,200,{ok:true})}
if(req.method==="POST"&&url.pathname==="/api/admin/settings"){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});const b=await body(req);if(b.siteName)config.siteName=String(b.siteName).slice(0,80);if(b.discordWebhook!==undefined)config.notifications.discordWebhook=String(b.discordWebhook);saveConfig();return json(res,200,{ok:true})}
if(req.method==="POST"&&url.pathname==="/api/admin/check"){if(!isAdmin(req))return json(res,401,{error:"Unauthorized"});await runChecks();return json(res,200,{ok:true})}
if(req.method==="GET"&&url.pathname==="/api/health")return json(res,200,{ok:true});
let requestPath=decodeURIComponent(url.pathname);if(requestPath==="/")requestPath="/index.html";if(requestPath==="/admin")requestPath="/admin.html";const filePath=path.normalize(path.join(PUBLIC_DIR,requestPath));if(!filePath.startsWith(PUBLIC_DIR+path.sep))return send(res,403,"Forbidden");fs.readFile(filePath,(e,data)=>{if(e)return send(res,e.code==="ENOENT"?404:500,e.code==="ENOENT"?"Not found":"Internal server error");const ext=path.extname(filePath);res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-cache":"public, max-age=3600","X-Content-Type-Options":"nosniff"});res.end(data)});
});
server.listen(PORT,HOST,()=>{console.log(`Craftpick Status listening on http://${HOST}:${PORT}`);runChecks();setInterval(runChecks,30000)});