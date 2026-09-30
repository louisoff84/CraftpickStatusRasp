const http=require("http");
const fs=require("fs");
const os=require("os");
const path=require("path");
const {execFile}=require("child_process");

const HOST=process.env.HOST||"0.0.0.0";
const PORT=Number(process.env.PORT||3000);
const PUBLIC_DIR=path.join(__dirname,"public");

function readFileSafe(file){try{return fs.readFileSync(file,"utf8").trim()}catch{return null}}
function getTemperature(){const raw=readFileSafe("/sys/class/thermal/thermal_zone0/temp");const v=raw?Number(raw)/1000:null;return Number.isFinite(v)?Math.round(v*10)/10:null}
function getCpuLoad(){const cpus=os.cpus();if(!cpus.length)return 0;let idle=0,total=0;for(const cpu of cpus){idle+=cpu.times.idle;total+=Object.values(cpu.times).reduce((a,b)=>a+b,0)}return total?Math.round((1-idle/total)*1000)/10:0}
function getMemory(){const total=os.totalmem(),free=os.freemem(),used=total-free;return{total,free,used,percent:total?Math.round(used/total*1000)/10:0}}
function getDisk(callback){execFile("df",["-k","/"],{timeout:1500},(error,stdout)=>{if(error)return callback(null);const parts=stdout.trim().split("\n").pop().trim().split(/\s+/);const percent=Number.parseInt((parts[4]||"").replace("%",""),10);if(!Number.isFinite(percent))return callback(null);callback({percent,totalKb:Number(parts[1])||0,usedKb:Number(parts[2])||0,freeKb:Number(parts[3])||0})})}
function getStatus(callback){getDisk(disk=>{const memory=getMemory(),cpus=os.cpus();callback({ok:true,timestamp:new Date().toISOString(),hostname:os.hostname(),platform:process.platform,arch:process.arch,node:process.version,uptime:os.uptime(),load:getCpuLoad(),cpuCount:cpus.length,cpuModel:cpus[0]?.model||"Unknown",temperature:getTemperature(),memory,disk,network:Object.entries(os.networkInterfaces()).flatMap(([name,entries])=>(entries||[]).filter(e=>!e.internal&&e.family==="IPv4").map(e=>({name,address:e.address})))})})}

const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".ico":"image/x-icon"};
function send(res,status,body,type="text/plain; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body)}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,\`http://\${req.headers.host||"localhost"}\`);
  if(url.pathname==="/api/status"){return getStatus(status=>send(res,200,JSON.stringify(status),"application/json; charset=utf-8"))}
  let requestPath=decodeURIComponent(url.pathname);if(requestPath==="/")requestPath="/index.html";
  const filePath=path.normalize(path.join(PUBLIC_DIR,requestPath));
  if(!filePath.startsWith(PUBLIC_DIR+path.sep))return send(res,403,"Forbidden");
  fs.readFile(filePath,(error,data)=>{if(error)return send(res,error.code==="ENOENT"?404:500,error.code==="ENOENT"?"Not found":"Internal server error");const ext=path.extname(filePath).toLowerCase();res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-cache":"public, max-age=3600","X-Content-Type-Options":"nosniff"});res.end(data)})
});
server.listen(PORT,HOST,()=>console.log(\`Craftpick Status running on http://\${HOST}:\${PORT}\`));
