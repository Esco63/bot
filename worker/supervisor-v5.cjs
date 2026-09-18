const http=require("node:http");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const PORT=Number(process.env.PORT||3000);
const TRADER_PORT=3001;
const VERSION="supervisor-v5-20260918";
const TRADER_URL="https://raw.githubusercontent.com/Esco63/bot/aacfca0fcf101735f52ef325439aef033302fee9/worker/trading-v3.cjs";
const TRADER_FILE="/tmp/trader-v3.cjs";

const HTML=`<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07090d"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Paper Bot">
<title>Second Trend Paper Bot</title>
<style>
:root{--bg:#07090d;--p:#0d1219;--b:#202b3a;--t:#f4f7fb;--m:#8f9baa;--u:#39d98a;--d:#ff6178;--a:#a99cff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0%,rgba(124,108,255,.13),transparent 32%),var(--bg);color:var(--t);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1100px,calc(100% - 24px));margin:auto;padding:max(24px,env(safe-area-inset-top)) 0 max(28px,env(safe-area-inset-bottom))}small{color:var(--a);font-weight:900;letter-spacing:.16em}h1{font-size:clamp(42px,9vw,62px);font-weight:400;letter-spacing:-.055em;margin:14px 0 22px}p{color:var(--m);line-height:1.5}.status,.panel,.card{border:1px solid var(--b);background:rgba(13,18,25,.95);border-radius:18px}.status{display:inline-block;margin:26px 0 18px;padding:13px 16px;font-size:12px;font-weight:800}.ok{color:var(--u)}.bad{color:var(--d)}.up{color:var(--u)!important}.down{color:var(--d)!important}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{padding:23px}.card b{display:block;font-size:36px}.card span{display:block;color:var(--m);margin-top:10px;font-size:13px;font-weight:700}.panel{padding:22px;margin-top:12px;overflow:hidden}.panel h2{margin:0 0 12px;font-size:25px;font-weight:400}.bar{display:flex;justify-content:space-between;gap:18px;align-items:center}.pills{display:flex;gap:8px;flex-wrap:wrap}.pill{border:1px solid var(--b);padding:8px 11px;border-radius:999px;color:#b9c3cf;font-size:11px;font-weight:800}.scroll{overflow:auto;margin:4px -22px -22px}table{width:100%;border-collapse:collapse;min-width:820px}th{padding:12px;color:#758298;text-align:left;font-size:10px}td{padding:12px;border-top:1px solid #202b3a;font-size:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}article{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #202b3a;padding:12px 0}article:first-child{border-top:0}article div{display:flex;flex-direction:column;gap:4px}article span{font-size:11px;color:var(--m)}.empty{text-align:center;padding:22px}.hot{color:var(--u)}.cold{color:var(--d)}footer{text-align:center;color:#6f7a89;font-size:11px;padding-top:20px}@media(max-width:800px){.cards{grid-template-columns:1fr}.bar{flex-direction:column;align-items:flex-start}.two{grid-template-columns:1fr}}
</style></head><body><main>
<small>KRAKEN · 24/7 · PAPER ONLY</small><h1>Second Trend Paper Bot</h1><p>Stabile V5-Oberfläche. Der Paper-Trader läuft im selben Dienst separat im Hintergrund.</p>
<div id="status" class="status">● Verbinde Worker…</div>
<section class="cards"><div class="card"><b id="equity">1.000,00 €</b><span id="pnl" class="up">+0,00 €</span></div><div class="card"><b id="cash">1.000,00 €</b><span>freies Cash</span></div><div class="card"><b id="count">0</b><span>offene Positionen</span></div><div class="card"><b id="fees">0,00 €</b><span>simulierte Gebühren</span></div></section>
<section class="panel bar"><div><h2>24/7 Paper Engine</h2><p id="engine">Lade Konfiguration…</p></div><div class="pills"><span id="kraken" class="pill">Kraken offline</span><span id="uptime" class="pill">Uptime 0m</span></div></section>
<section class="panel"><h2>Live Scanner</h2><div class="scroll"><table><thead><tr><th>Markt</th><th>Bid / Ask</th><th>Spread</th><th>1s</th><th>3s</th><th>5s</th><th>OBI</th><th>Score</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<section class="two"><section class="panel"><h2>Offene Positionen</h2><div id="positions"><p class="empty">Keine offene Position.</p></div></section><section class="panel"><h2>Letzte Trades</h2><div id="trades"><p class="empty">Noch keine Trades.</p></div></section></section>
<footer>Nur Paper Trading · keine echten Orders · kein echtes Geld</footer>
<script>
const el=id=>document.getElementById(id),eur=n=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n)||0),num=n=>n==null?"–":new Intl.NumberFormat("de-DE",{maximumFractionDigits:6}).format(n),per=(n,d=3)=>n==null?"–":(n>0?"+":"")+Number(n).toFixed(d)+"%",age=s=>{s=Number(s)||0;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+"h "+m+"m":m+"m"};
async function load(){try{const r=await fetch("/state",{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json(),p=d.paper||{},c=d.config||{},pl=Number(d.pnl)||0;el("status").className="status "+(d.online&&p.running?"ok":"bad");el("status").textContent="● "+(d.online?(p.running?"Worker läuft 24/7":"Worker pausiert"):"Kraken offline");el("equity").textContent=eur(d.equity);el("pnl").textContent=(pl>=0?"+":"")+eur(pl);el("pnl").className=pl>=0?"up":"down";el("cash").textContent=eur(p.cash);el("count").textContent=(p.positions||[]).length;el("fees").textContent=eur(p.fees);el("kraken").textContent=d.online?"Kraken verbunden":"Kraken offline";el("uptime").textContent="Uptime "+age(d.uptimeSeconds);el("engine").textContent="Kauf ab Score ≥ "+(c.scoreThreshold??75)+", dynamisch "+eur(c.minPositionEur??100)+"–"+eur(c.maxPositionEur??500)+" pro Position. Gewinnziel +"+(c.targetNetPct??.25)+"% netto, Stop "+(c.stopNetPct??-3)+"%. Gebühren "+(c.feePct??.8)+"% pro Ausführung.";el("rows").innerHTML=[...(d.rows||[])].sort((a,b)=>b.score-a.score).map(x=>"<tr><td><b>"+x.symbol+"</b></td><td>"+num(x.bid)+" / "+num(x.ask)+"</td><td>"+(x.spread==null?"–":Number(x.spread).toFixed(3)+"%")+"</td><td class='"+((x.m1??0)>=0?"up":"down")+"'>"+per(x.m1)+"</td><td class='"+((x.m3??0)>=0?"up":"down")+"'>"+per(x.m3)+"</td><td class='"+((x.m5??0)>=0?"up":"down")+"'>"+per(x.m5)+"</td><td>"+(x.obi==null?"–":Number(x.obi).toFixed(2))+"</td><td class='"+(x.score>=75?"hot":x.score<=-75?"cold":"")+"'><b>"+(x.score>0?"+":"")+x.score+"</b></td></tr>").join("");el("positions").innerHTML=(p.positions||[]).length?p.positions.map(x=>"<article><div><b>"+x.symbol+"</b><span>Entry "+num(x.entry)+" · Einsatz "+eur(x.budget??x.cost)+" · Score "+x.score+"</span></div><b>"+Math.max(0,Math.floor((Date.now()-x.openedAt)/1000))+"s</b></article>").join(""):"<p class='empty'>Keine offene Position.</p>";el("trades").innerHTML=(p.trades||[]).length?p.trades.slice(0,10).map(x=>"<article><div><b>"+x.symbol+"</b><span>"+x.reason+" · "+per(x.pct,2)+"</span></div><b class='"+(x.pnl>=0?"up":"down")+"'>"+(x.pnl>=0?"+":"")+eur(x.pnl)+"</b></article>").join(""):"<p class='empty'>Noch keine Trades.</p>"}catch{el("status").className="status bad";el("status").textContent="● Worker nicht erreichbar"}}load();setInterval(load,1000);
</script></main></body></html>`;

async function fetchTrader(){
  const r=await fetch(TRADER_URL);
  if(!r.ok)throw new Error("trader HTTP "+r.status);
  fs.writeFileSync(TRADER_FILE,await r.text());
}

let trader=null;
async function startTrader(){
  await fetchTrader();
  const env={...process.env,PORT:String(TRADER_PORT)};
  trader=spawn(process.execPath,[TRADER_FILE],{env,stdio:"inherit"});
  trader.on("exit",(code,signal)=>{
    console.error("trader exited",code,signal);
    setTimeout(()=>startTrader().catch(e=>console.error("restart trader",e)),1500);
  });
}

async function proxyJson(path,res){
  try{
    const r=await fetch("http://127.0.0.1:"+TRADER_PORT+path,{cache:"no-store"});
    const body=await r.text();
    res.writeHead(r.status,{"content-type":r.headers.get("content-type")||"application/json","cache-control":"no-store"});
    res.end(body);
  }catch(e){
    res.writeHead(503,{"content-type":"application/json"});
    res.end(JSON.stringify({error:"worker_starting"}));
  }
}

http.createServer(async(req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname;
  if(path==="/"||path==="/index.html"){
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-runtime-version":VERSION});
    return res.end(HTML);
  }
  if(path==="/health"){
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    return res.end(JSON.stringify({ok:true,version:VERSION}));
  }
  if(path==="/version"){
    res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({version:VERSION}));
  }
  if(path==="/state"||path==="/worker-health") return proxyJson(path==="/state"?"/state":"/health",res);
  res.writeHead(404,{"content-type":"application/json"});
  res.end(JSON.stringify({error:"not_found"}));
}).listen(PORT,"0.0.0.0",()=>console.log("supervisor dashboard listening on :"+PORT,VERSION));

startTrader().catch(e=>console.error("start trader",e));
process.on("SIGTERM",()=>{try{trader&&trader.kill("SIGTERM")}catch{};process.exit(0)});
