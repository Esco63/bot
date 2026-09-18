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
  if(req.method==="OPTIONS")return json(res,204,{});
  if(req.url==="/health")return json(res,200,{ok:true,online,running:paper.running,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000)});
  if(req.url==="/state"){
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
