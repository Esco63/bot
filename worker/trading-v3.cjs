const http = require("node:http");
const fs = require("node:fs");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || "/data/paper-state.json";
const PORTFOLIO_VERSION = process.env.PORTFOLIO_VERSION || "v3-1000-dynamic";
const SYMBOLS = ["BTC/EUR","ETH/EUR","SOL/EUR"];

const FEE_PCT = Number(process.env.FEE_PCT || "0.8");
const TARGET_NET_PCT = Number(process.env.TARGET_NET_PCT || "0.25");
const STOP_NET_PCT = Number(process.env.STOP_NET_PCT || "-3");
const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || "75");
const MIN_POSITION_EUR = Number(process.env.MIN_POSITION_EUR || "100");
const MAX_POSITION_EUR = Number(process.env.MAX_POSITION_EUR || "500");
const MAX_POSITIONS = Number(process.env.MAX_POSITIONS || "2");
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || "20000");
const MAX_HOLD_MS = Number(process.env.MAX_HOLD_MS || String(6*60*60*1000));
const STARTING_CAPITAL_EUR = Number(process.env.STARTING_CAPITAL_EUR || "1000");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const STATIC_DIR = process.env.STATIC_DIR || "/tmp/ui";
const DASHBOARD_HTML = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07090d"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Paper Bot"><title>Second Trend Paper Bot</title>
<style>
:root{--bg:#07090d;--p:#0d1219;--b:#202b3a;--t:#f4f7fb;--m:#8f9baa;--u:#39d98a;--d:#ff6178;--a:#a99cff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1100px,calc(100% - 24px));margin:auto;padding:max(22px,env(safe-area-inset-top)) 0 28px}small{color:var(--a);font-weight:900;letter-spacing:.15em}h1{font-size:clamp(42px,9vw,62px);font-weight:400;letter-spacing:-.055em;margin:14px 0 24px}p{color:var(--m);line-height:1.5}.status,.panel,.card{border:1px solid var(--b);background:var(--p);border-radius:18px}.status{display:inline-block;padding:13px 16px;margin:26px 0 18px;font-weight:800}.ok{color:var(--u)}.bad{color:var(--d)}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{padding:23px}.card b{display:block;font-size:34px}.card span{display:block;color:var(--m);margin-top:10px;font-size:13px}.up{color:var(--u)!important}.down{color:var(--d)!important}.panel{padding:22px;margin-top:12px;overflow:hidden}.panel h2{font-size:25px;font-weight:400;margin:0 0 12px}.bar{display:flex;justify-content:space-between;gap:16px;align-items:center}.pills{display:flex;gap:8px;flex-wrap:wrap}.pill{border:1px solid var(--b);padding:8px 11px;border-radius:999px;color:#b9c3cf;font-size:11px;font-weight:800}.scroll{overflow:auto;margin:4px -22px -22px}table{width:100%;border-collapse:collapse;min-width:820px}th{padding:12px;color:#758298;text-align:left;font-size:10px}td{padding:12px;border-top:1px solid #202b3a;font-size:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}article{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #202b3a;padding:12px 0}article:first-child{border-top:0}article div{display:flex;flex-direction:column;gap:4px}article span{font-size:11px;color:var(--m)}.empty{text-align:center;padding:20px}.hot{color:var(--u)}.cold{color:var(--d)}footer{text-align:center;color:#6f7a89;font-size:11px;padding-top:20px}@media(max-width:800px){.cards{grid-template-columns:1fr}.bar{flex-direction:column;align-items:flex-start}.two{grid-template-columns:1fr}}
</style></head><body><main>
<small>KRAKEN · 24/7 · PAPER ONLY</small><h1>Second Trend Paper Bot</h1><p>V3 läuft dauerhaft auf Railway. Startkapital 1.000 €, dynamische Positionsgröße 100–500 €.</p>
<div id="status" class="status">● Verbinde Worker…</div>
<section class="cards"><div class="card"><b id="equity">1.000,00 €</b><span id="pnl" class="up">+0,00 €</span></div><div class="card"><b id="cash">1.000,00 €</b><span>freies Cash</span></div><div class="card"><b id="count">0</b><span>offene Positionen</span></div><div class="card"><b id="fees">0,00 €</b><span>simulierte Gebühren</span></div></section>
<section class="panel bar"><div><h2>24/7 Paper Engine</h2><p id="engine">Lade Konfiguration…</p></div><div class="pills"><span id="kraken" class="pill">Kraken offline</span><span id="uptime" class="pill">Uptime 0m</span></div></section>
<section class="panel"><h2>Live Scanner</h2><div class="scroll"><table><thead><tr><th>Markt</th><th>Bid / Ask</th><th>Spread</th><th>1s</th><th>3s</th><th>5s</th><th>OBI</th><th>Score</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<section class="two"><section class="panel"><h2>Offene Positionen</h2><div id="positions"><p class="empty">Keine Position.</p></div></section><section class="panel"><h2>Letzte Trades</h2><div id="trades"><p class="empty">Noch keine Trades.</p></div></section></section>
<footer>Nur Paper Trading · keine echten Orders · kein echtes Geld</footer>
<script>
const $=id=>document.getElementById(id),eur=n=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n)||0),num=n=>n==null?"–":new Intl.NumberFormat("de-DE",{maximumFractionDigits:6}).format(n),pc=(n,d=3)=>n==null?"–":(n>0?"+":"")+Number(n).toFixed(d)+"%",age=s=>{s=Number(s)||0;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+"h "+m+"m":m+"m"};
async function load(){try{const r=await fetch("/state",{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json(),p=d.paper||{},c=d.config||{},pl=Number(d.pnl)||0;$("status").className="status "+(d.online&&p.running?"ok":"bad");$("status").textContent="● "+(d.online?(p.running?"Worker läuft 24/7":"Worker pausiert"):"Kraken offline");$("equity").textContent=eur(d.equity);$("pnl").textContent=(pl>=0?"+":"")+eur(pl);$("pnl").className=pl>=0?"up":"down";$("cash").textContent=eur(p.cash);$("count").textContent=(p.positions||[]).length;$("fees").textContent=eur(p.fees);$("kraken").textContent=d.online?"Kraken verbunden":"Kraken offline";$("uptime").textContent="Uptime "+age(d.uptimeSeconds);$("engine").textContent="Kauf ab Score ≥ "+(c.scoreThreshold??75)+", dynamisch "+eur(c.minPositionEur??100)+"–"+eur(c.maxPositionEur??500)+" pro Position. Gewinnziel +"+(c.targetNetPct??.25)+"% netto, Stop "+(c.stopNetPct??-3)+"%. Gebühren "+(c.feePct??.8)+"% pro Ausführung.";$("rows").innerHTML=[...(d.rows||[])].sort((a,b)=>b.score-a.score).map(x=>"<tr><td><b>"+x.symbol+"</b></td><td>"+num(x.bid)+" / "+num(x.ask)+"</td><td>"+(x.spread==null?"–":x.spread.toFixed(3)+"%")+"</td><td class='"+((x.m1??0)>=0?"up":"down")+"'>"+pc(x.m1)+"</td><td class='"+((x.m3??0)>=0?"up":"down")+"'>"+pc(x.m3)+"</td><td class='"+((x.m5??0)>=0?"up":"down")+"'>"+pc(x.m5)+"</td><td>"+(x.obi==null?"–":x.obi.toFixed(2))+"</td><td class='"+(x.score>=75?"hot":x.score<=-75?"cold":"")+"'><b>"+(x.score>0?"+":"")+x.score+"</b></td></tr>").join("");$("positions").innerHTML=(p.positions||[]).length?p.positions.map(x=>"<article><div><b>"+x.symbol+"</b><span>Entry "+num(x.entry)+" · Einsatz "+eur(x.budget??x.cost)+" · Score "+x.score+"</span></div><b>"+Math.max(0,Math.floor((Date.now()-x.openedAt)/1000))+"s</b></article>").join(""):"<p class='empty'>Keine offene Position.</p>";$("trades").innerHTML=(p.trades||[]).length?p.trades.slice(0,10).map(x=>"<article><div><b>"+x.symbol+"</b><span>"+x.reason+" · "+pc(x.pct,2)+"</span></div><b class='"+(x.pnl>=0?"up":"down")+"'>"+(x.pnl>=0?"+":"")+eur(x.pnl)+"</b></article>").join(""):"<p class='empty'>Noch keine Trades.</p>"}catch{$("status").className="status bad";$("status").textContent="● Worker nicht erreichbar"}}load();setInterval(load,1000);
</script></main></body></html>`;

const startedAt = Date.now();
let online = false;
let reconnectDelay = 1000;
let ws = null;
let latestRows = [];
const books = new Map(SYMBOLS.map((s) => [s, { bids:new Map(), asks:new Map() }]));
const ticks = new Map();
const histories = new Map(SYMBOLS.map((s) => [s, []]));
const lastTradeAt = new Map();

function newPaper() {
  return {
    version: PORTFOLIO_VERSION,
    running: true,
    cash: STARTING_CAPITAL_EUR,
    initial: STARTING_CAPITAL_EUR,
    fees: 0,
    positions: [],
    trades: []
  };
}

let paper = newPaper();
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
    if (saved && saved.version === PORTFOLIO_VERSION && Number.isFinite(saved.cash)) {
      paper = saved;
    } else {
      console.log("New portfolio version; starting with", STARTING_CAPITAL_EUR, "EUR");
    }
  }
} catch (e) {
  console.error("state-load",e);
}

function persist() {
  try {
    fs.mkdirSync("/data",{recursive:true});
    const temp = DATA_FILE + ".tmp";
    fs.writeFileSync(temp,JSON.stringify(paper));
    fs.renameSync(temp,DATA_FILE);
  } catch (e) {
    console.error("persist",e);
  }
}

function side(book,key) {
  const source = key === "bids" ? book.bids : book.asks;
  return [...source.entries()]
    .sort((a,b) => key === "bids" ? b[0]-a[0] : a[0]-b[0])
    .slice(0,10);
}

function buy(book,budget) {
  const asks = side(book,"asks");
  if (!asks.length) return null;
  const rate = FEE_PCT/100;
  const beforeFee = budget/(1+rate);
  let left=beforeFee, qty=0, cost=0;
  for (const [price,volume] of asks) {
    const use=Math.min(left,price*volume);
    qty+=use/price;
    cost+=use;
    left-=use;
    if(left<1e-9)break;
  }
  if(!qty)return null;
  const fee=cost*rate;
  return {qty,cost,fee,total:cost+fee,vwap:cost/qty,fill:cost/beforeFee};
}

function sell(book,wanted) {
  const bids=side(book,"bids");
  if(!bids.length)return null;
  const rate=FEE_PCT/100;
  let left=wanted,qty=0,gross=0;
  for(const [price,volume] of bids) {
    const use=Math.min(left,volume);
    qty+=use;
    gross+=use*price;
    left-=use;
    if(left<1e-12)break;
  }
  if(!qty)return null;
  const fee=gross*rate;
  return {qty,gross,fee,net:gross-fee,vwap:gross/qty,fill:qty/wanted};
}

const pct=(a,b)=>b?(a/b-1)*100:0;
function ago(history,target){for(let i=history.length-1;i>=0;i--)if(history[i].t<=target)return history[i].p;return null}

function imbalance(book) {
  const bids=side(book,"bids").slice(0,5), asks=side(book,"asks").slice(0,5);
  if(!bids.length||!asks.length)return null;
  const bv=bids.reduce((n,x)=>n+x[1],0), av=asks.reduce((n,x)=>n+x[1],0);
  return bv+av?(bv-av)/(bv+av):0;
}

function calcScore(m1,m3,m5,obi,spread) {
  const norm=(v,s)=>v==null?0:Math.tanh(v/s);
  let value=norm(m1,.025)*35+norm(m3,.05)*25+norm(m5,.08)*20+(obi??0)*25;
  if(spread!=null)value-=Math.min(spread/.1,1)*10;
  return Math.max(-100,Math.min(100,Math.round(value)));
}

function positionBudget(score,cash) {
  if(cash<MIN_POSITION_EUR)return 0;
  const strength=Math.max(0,Math.min(1,(score-SCORE_THRESHOLD)/Math.max(1,100-SCORE_THRESHOLD)));
  const desired=MIN_POSITION_EUR+strength*(MAX_POSITION_EUR-MIN_POSITION_EUR);
  return Math.round(Math.min(cash,desired)*100)/100;
}

function updateRows() {
  const now=Date.now();
  latestRows=SYMBOLS.map(symbol=>{
    const t=ticks.get(symbol)||{}, bid=t.bid??null, ask=t.ask??null;
    const mid=bid&&ask?(bid+ask)/2:null, history=histories.get(symbol)||[];
    const momentum=(seconds)=>{const prev=ago(history,now-seconds*1000);return mid&&prev?pct(mid,prev):null};
    const m1=momentum(1),m3=momentum(3),m5=momentum(5),obi=imbalance(books.get(symbol));
    const spread=mid&&bid&&ask?((ask-bid)/mid)*100:null;
    return {symbol,bid,ask,spread,m1,m3,m5,obi,score:calcScore(m1,m3,m5,obi,spread)};
  });
}

function equity() {
  let value=paper.cash;
  for(const p of paper.positions){
    const fill=sell(books.get(p.symbol),p.qty);
    value+=fill&&fill.fill>=.999?fill.net:p.cost;
  }
  return value;
}

function tradeTick() {
  if(!paper.running||!online)return;
  const now=Date.now();let changed=false;

  for(const p of [...paper.positions]){
    const fill=sell(books.get(p.symbol),p.qty);
    if(!fill||fill.fill<.999)continue;
    const pnl=fill.net-p.cost, netPct=pct(fill.net,p.cost);
    const reason=netPct>=TARGET_NET_PCT?"Gewinnziel":netPct<=STOP_NET_PCT?"Stop-Loss":now-p.openedAt>=MAX_HOLD_MS?"Zeitlimit":"";
    if(!reason)continue;
    paper.cash+=fill.net;
    paper.fees+=fill.fee;
    paper.positions=paper.positions.filter(x=>x.id!==p.id);
    paper.trades.unshift({...p,closedAt:now,exit:fill.vwap,sellFee:fill.fee,pnl,pct:netPct,reason});
    paper.trades=paper.trades.slice(0,1000);
    lastTradeAt.set(p.symbol,now);
    changed=true;
  }

  if(paper.positions.length<MAX_POSITIONS){
    for(const row of [...latestRows].sort((a,b)=>b.score-a.score)){
      if(paper.positions.some(p=>p.symbol===row.symbol))continue;
      if(now-(lastTradeAt.get(row.symbol)||0)<COOLDOWN_MS)continue;
      if(row.score<SCORE_THRESHOLD||(row.spread??9)>.1||(row.m1??-1)<=0||(row.m3??-1)<=0||(row.m5??-1)<=0||(row.obi??-1)<=0)continue;

      const budget=positionBudget(row.score,paper.cash);
      if(budget<MIN_POSITION_EUR)break;
      const fill=buy(books.get(row.symbol),budget);
      if(!fill||fill.fill<.999)continue;

      paper.cash-=fill.total;
      paper.fees+=fill.fee;
      paper.positions.push({
        id:Date.now()+"-"+Math.random().toString(36).slice(2),
        symbol:row.symbol,
        openedAt:now,
        entry:fill.vwap,
        qty:fill.qty,
        cost:fill.total,
        buyFee:fill.fee,
        score:row.score,
        budget
      });
      console.log("PAPER BUY",row.symbol,"score",row.score,"budget",budget.toFixed(2));
      lastTradeAt.set(row.symbol,now);
      changed=true;
      break;
    }
  }

  if(changed)persist();
}

function sendFile(res,path,type){
  try{
    const body=fs.readFileSync(path);
    res.writeHead(200,{"content-type":type,"cache-control":"no-store"});
    res.end(body);
  }catch(e){
    res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});
    res.end("not_found");
  }
}

function json(res,status,body){
  res.writeHead(status,{
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":CORS_ORIGIN,
    "access-control-allow-methods":"GET,OPTIONS",
    "cache-control":"no-store"
  });
  res.end(JSON.stringify(body));
}

const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url||"/","http://localhost").pathname;
  if(req.method==="OPTIONS")return json(res,204,{});
  if(pathname==="/" || pathname==="/index.html"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(DASHBOARD_HTML);}
  if(pathname==="/sw.js") return sendFile(res,STATIC_DIR+"/sw-v3.js","application/javascript; charset=utf-8");
  if(pathname==="/manifest.webmanifest") return sendFile(res,STATIC_DIR+"/manifest-v3.webmanifest","application/manifest+json; charset=utf-8");
  if(pathname==="/icon.svg") return sendFile(res,STATIC_DIR+"/icon-v3.svg","image/svg+xml");
  if(pathname==="/health")return json(res,200,{ok:true,online,running:paper.running,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000)});
  if(pathname==="/state"){
    const e=equity();
    return json(res,200,{
      online,
      serverTime:Date.now(),
      uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),
      config:{
        feePct:FEE_PCT,
        targetNetPct:TARGET_NET_PCT,
        stopNetPct:STOP_NET_PCT,
        scoreThreshold:SCORE_THRESHOLD,
        minPositionEur:MIN_POSITION_EUR,
        maxPositionEur:MAX_POSITION_EUR,
        maxPositions:MAX_POSITIONS,
        positionSizing:"score-linear"
      },
      paper,
      equity:e,
      pnl:e-paper.initial,
      rows:latestRows
    });
  }
  return json(res,404,{error:"not_found"});
});

server.listen(PORT,"0.0.0.0",()=>console.log("paper-v3 listening on :"+PORT));

function connect(){
  console.log("connecting Kraken websocket");
  ws=new WebSocket("wss://ws.kraken.com/v2");
  ws.addEventListener("open",()=>{
    online=true;reconnectDelay=1000;console.log("Kraken websocket connected");
    ws.send(JSON.stringify({method:"subscribe",params:{channel:"ticker",symbol:SYMBOLS,event_trigger:"bbo",snapshot:true}}));
    ws.send(JSON.stringify({method:"subscribe",params:{channel:"book",symbol:SYMBOLS,depth:10,snapshot:true}}));
  });
  ws.addEventListener("message",ev=>{
    let m;try{m=JSON.parse(String(ev.data))}catch{return}
    const now=Date.now();
    if(m.channel==="ticker")for(const x of m.data||[]){
      if(!SYMBOLS.includes(x.symbol))continue;
      const next={...(ticks.get(x.symbol)||{})};
      if(x.bid!=null)next.bid=Number(x.bid);
      if(x.ask!=null)next.ask=Number(x.ask);
      ticks.set(x.symbol,next);
      if(next.bid&&next.ask){
        const h=histories.get(x.symbol)||[];
        h.push({t:now,p:(next.bid+next.ask)/2});
        while(h[0]?.t<now-10000)h.shift();
        histories.set(x.symbol,h);
      }
    }
    if(m.channel==="book")for(const x of m.data||[]){
      if(!SYMBOLS.includes(x.symbol))continue;
      const book=m.type==="snapshot"?{bids:new Map(),asks:new Map()}:books.get(x.symbol);
      for(const level of x.bids||[]){const p=Number(level.price),q=Number(level.qty);q===0?book.bids.delete(p):book.bids.set(p,q)}
      for(const level of x.asks||[]){const p=Number(level.price),q=Number(level.qty);q===0?book.asks.delete(p):book.asks.set(p,q)}
      book.bids=new Map(side(book,"bids"));
      book.asks=new Map(side(book,"asks"));
      books.set(x.symbol,book);
    }
  });
  const retry=()=>{
    online=false;
    console.log("Kraken websocket disconnected; reconnect in",reconnectDelay);
    setTimeout(connect,reconnectDelay);
    reconnectDelay=Math.min(reconnectDelay*2,30000);
  };
  ws.addEventListener("close",retry);
  ws.addEventListener("error",()=>{console.error("Kraken websocket error");try{ws.close()}catch{}});
}

persist();
connect();
setInterval(updateRows,250);
setInterval(()=>{try{tradeTick()}catch(e){console.error("tradeTick",e)}},250);
setInterval(persist,60000);
process.on("SIGTERM",()=>{persist();process.exit(0)});
process.on("uncaughtException",e=>console.error("uncaughtException",e));
process.on("unhandledRejection",e=>console.error("unhandledRejection",e));
