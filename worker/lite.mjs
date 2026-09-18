import http from "node:http";
import fs from "node:fs";
import webpush from "web-push";

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || "/data/paper-state.json";
const SYMBOLS = ["BTC/EUR","ETH/EUR","SOL/EUR"];
const FEE_PCT = Number(process.env.FEE_PCT || "0.8");
const TARGET_NET_PCT = Number(process.env.TARGET_NET_PCT || "0.25");
const STOP_NET_PCT = Number(process.env.STOP_NET_PCT || "-3");
const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || "75");
const MAX_POSITION_EUR = Number(process.env.MAX_POSITION_EUR || "20");
const MAX_POSITIONS = Number(process.env.MAX_POSITIONS || "2");
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || "20000");
const MAX_HOLD_MS = Number(process.env.MAX_HOLD_MS || String(6*60*60*1000));
const STARTING_CAPITAL_EUR = Number(process.env.STARTING_CAPITAL_EUR || "100");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const PUSH_FILE = process.env.PUSH_FILE || "/data/push-subscriptions.json";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://paper-worker-runtime-production.up.railway.app";

if(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY){
  webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
  console.log("Web Push ready");
}

const startedAt = Date.now();
let online = false;
let reconnectDelay = 1000;
let ws = null;
let latestRows = [];
const books = new Map(SYMBOLS.map(s=>[s,{bids:new Map(),asks:new Map()}]));
const ticks = new Map();
const histories = new Map(SYMBOLS.map(s=>[s,[]]));
const lastTradeAt = new Map();
let pushSubscriptions = [];
try{
  if(fs.existsSync(PUSH_FILE)){
    const savedPush=JSON.parse(fs.readFileSync(PUSH_FILE,"utf8"));
    if(Array.isArray(savedPush)) pushSubscriptions=savedPush;
  }
}catch(e){console.error("push-load",e)}

function persistPush(){
  try{
    fs.mkdirSync("/data",{recursive:true});
    const tmp=PUSH_FILE+".tmp";
    fs.writeFileSync(tmp,JSON.stringify(pushSubscriptions));
    fs.renameSync(tmp,PUSH_FILE);
  }catch(e){console.error("push-persist",e)}
}

async function sendPushToAll(payload){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY||!pushSubscriptions.length)return;
  const next=[];
  for(const sub of pushSubscriptions){
    try{
      await webpush.sendNotification(sub,JSON.stringify(payload),{TTL:3600,urgency:"high"});
      next.push(sub);
    }catch(e){
      const status=e?.statusCode||0;
      if(status!==404&&status!==410){
        console.error("push-send",status,e?.message||e);
        next.push(sub);
      }
    }
  }
  if(next.length!==pushSubscriptions.length){
    pushSubscriptions=next;
    persistPush();
  }
}

async function notifySuccessfulTrade(trade){
  const plus=trade.pnl>=0?"+":"";
  const balance=equity();
  await sendPushToAll({
    title:"✅ Paper-Trade erfolgreich",
    body:trade.symbol+": "+plus+trade.pnl.toFixed(2)+" € ("+plus+trade.pct.toFixed(2)+"%) · Konto "+balance.toFixed(2)+" €",
    tag:"trade-"+trade.id+"-"+trade.closedAt,
    url:"/"
  });
}

let paper = {
  running:true,
  cash:STARTING_CAPITAL_EUR,
  initial:STARTING_CAPITAL_EUR,
  fees:0,
  positions:[],
  trades:[]
};

try{
  if(fs.existsSync(DATA_FILE)){
    const saved=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
    if(saved && Number.isFinite(saved.cash)) paper=saved;
  }
}catch(e){console.error("state-load",e)}

function persist(){
  try{
    fs.mkdirSync("/data",{recursive:true});
    const tmp=DATA_FILE+".tmp";
    fs.writeFileSync(tmp,JSON.stringify(paper));
    fs.renameSync(tmp,DATA_FILE);
  }catch(e){console.error("persist",e)}
}
function side(book,key){
  const src=key==="bids"?book.bids:book.asks;
  return [...src.entries()].sort((a,b)=>key==="bids"?b[0]-a[0]:a[0]-b[0]).slice(0,10);
}
function buy(book,budget){
  const asks=side(book,"asks"); if(!asks.length)return null;
  const r=FEE_PCT/100,grossBudget=budget/(1+r); let left=grossBudget,qty=0,cost=0;
  for(const [price,volume] of asks){const use=Math.min(left,price*volume);qty+=use/price;cost+=use;left-=use;if(left<1e-9)break}
  if(!qty)return null; const fee=cost*r;
  return {qty,cost,fee,total:cost+fee,vwap:cost/qty,fill:cost/grossBudget};
}
function sell(book,want){
  const bids=side(book,"bids"); if(!bids.length)return null;
  const r=FEE_PCT/100; let left=want,qty=0,gross=0;
  for(const [price,volume] of bids){const use=Math.min(left,volume);qty+=use;gross+=use*price;left-=use;if(left<1e-12)break}
  if(!qty)return null; const fee=gross*r;
  return {qty,gross,fee,net:gross-fee,vwap:gross/qty,fill:qty/want};
}
const pct=(a,b)=>b?(a/b-1)*100:0;
function ago(h,t){for(let i=h.length-1;i>=0;i--)if(h[i].t<=t)return h[i].p;return null}
function imbalance(book){
  const bids=side(book,"bids").slice(0,5),asks=side(book,"asks").slice(0,5);
  if(!bids.length||!asks.length)return null;
  const bv=bids.reduce((n,x)=>n+x[1],0),av=asks.reduce((n,x)=>n+x[1],0);
  return bv+av?(bv-av)/(bv+av):0;
}
function score(m1,m3,m5,obi,spread){
  const norm=(v,s)=>v==null?0:Math.tanh(v/s);
  let x=norm(m1,.025)*35+norm(m3,.05)*25+norm(m5,.08)*20+(obi??0)*25;
  if(spread!=null)x-=Math.min(spread/.1,1)*10;
  return Math.max(-100,Math.min(100,Math.round(x)));
}
function updateRows(){
  const now=Date.now();
  latestRows=SYMBOLS.map(symbol=>{
    const t=ticks.get(symbol)||{},bid=t.bid??null,ask=t.ask??null,mid=bid&&ask?(bid+ask)/2:null,h=histories.get(symbol)||[];
    const mom=s=>{const p=ago(h,now-s*1000);return mid&&p?pct(mid,p):null};
    const m1=mom(1),m3=mom(3),m5=mom(5),obi=imbalance(books.get(symbol)),spread=mid&&bid&&ask?((ask-bid)/mid)*100:null;
    return {symbol,bid,ask,spread,m1,m3,m5,obi,score:score(m1,m3,m5,obi,spread)};
  });
}
function equity(){
  let e=paper.cash;
  for(const p of paper.positions){const f=sell(books.get(p.symbol),p.qty);e+=f&&f.fill>=.999?f.net:p.cost}
  return e;
}
function tradeTick(){
  if(!paper.running||!online)return;
  const now=Date.now();let changed=false;
  for(const p of [...paper.positions]){
    const f=sell(books.get(p.symbol),p.qty);if(!f||f.fill<.999)continue;
    const pnl=f.net-p.cost,pp=pct(f.net,p.cost);
    const reason=pp>=TARGET_NET_PCT?"Gewinnziel":pp<=STOP_NET_PCT?"Stop-Loss":now-p.openedAt>=MAX_HOLD_MS?"Zeitlimit":"";
    if(!reason)continue;
    paper.cash+=f.net;paper.fees+=f.fee;paper.positions=paper.positions.filter(x=>x.id!==p.id);
    const closedTrade={...p,closedAt:now,exit:f.vwap,sellFee:f.fee,pnl,pct:pp,reason};
    paper.trades.unshift(closedTrade);
    paper.trades=paper.trades.slice(0,1000);lastTradeAt.set(p.symbol,now);changed=true;
    if(pnl>0)notifySuccessfulTrade(closedTrade).catch(e=>console.error("trade-push",e));
  }
  if(paper.positions.length<MAX_POSITIONS){
    for(const row of [...latestRows].sort((a,b)=>b.score-a.score)){
      if(paper.positions.some(p=>p.symbol===row.symbol))continue;
      if(now-(lastTradeAt.get(row.symbol)||0)<COOLDOWN_MS)continue;
      if(row.score<SCORE_THRESHOLD||(row.spread??9)>.1||(row.m1??-1)<=0||(row.m3??-1)<=0||(row.m5??-1)<=0||(row.obi??-1)<=0)continue;
      const budget=Math.min(paper.cash,MAX_POSITION_EUR);if(budget<5)break;
      const f=buy(books.get(row.symbol),budget);if(!f||f.fill<.999)continue;
      paper.cash-=f.total;paper.fees+=f.fee;
      paper.positions.push({id:Date.now()+"-"+Math.random().toString(36).slice(2),symbol:row.symbol,openedAt:now,entry:f.vwap,qty:f.qty,cost:f.total,buyFee:f.fee,score:row.score});
      lastTradeAt.set(row.symbol,now);changed=true;break;
    }
  }
  if(changed)persist();
}
function json(res,status,body){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","access-control-allow-origin":CORS_ORIGIN,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
async function readJson(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>100000)throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS")return json(res,204,{});
  if(req.url==="/push/public-key"&&req.method==="GET")return json(res,200,{publicKey:VAPID_PUBLIC_KEY});
  if(req.url==="/push/subscribe"&&req.method==="POST"){
    try{
      const sub=await readJson(req);
      if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return json(res,400,{error:"invalid_subscription"});
      const i=pushSubscriptions.findIndex(x=>x.endpoint===sub.endpoint);
      if(i>=0)pushSubscriptions[i]=sub; else pushSubscriptions.push(sub);
      persistPush();
      try{
        await webpush.sendNotification(sub,JSON.stringify({
          title:"🔔 Mitteilungen aktiviert",
          body:"Du bekommst ab jetzt eine Nachricht bei erfolgreichen Paper-Trades.",
          tag:"push-enabled",
          url:"/"
        }),{TTL:300,urgency:"high"});
      }catch(e){console.error("push-test",e?.statusCode||"",e?.message||e)}
      return json(res,200,{ok:true,subscriptions:pushSubscriptions.length});
    }catch(e){
      console.error("push-subscribe",e);
      return json(res,400,{error:"bad_request"});
    }
  }
  if(req.url==="/health")return json(res,200,{ok:true,online,running:paper.running,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000)});
  if(req.url==="/state"){
    const e=equity();
    return json(res,200,{online,serverTime:Date.now(),uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),config:{feePct:FEE_PCT,targetNetPct:TARGET_NET_PCT,stopNetPct:STOP_NET_PCT,scoreThreshold:SCORE_THRESHOLD,maxPositionEur:MAX_POSITION_EUR,maxPositions:MAX_POSITIONS},paper,equity:e,pnl:e-paper.initial,rows:latestRows});
  }
  return json(res,404,{error:"not_found"});
});
server.listen(PORT,"0.0.0.0",()=>console.log("paper-lite listening on :"+PORT));

function connect(){
  if(typeof WebSocket!=="function"){console.error("Global WebSocket unavailable on",process.version);return}
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
      const prev=ticks.get(x.symbol)||{},next={...prev};
      if(x.bid!=null)next.bid=Number(x.bid);if(x.ask!=null)next.ask=Number(x.ask);ticks.set(x.symbol,next);
      if(next.bid&&next.ask){const h=histories.get(x.symbol)||[];h.push({t:now,p:(next.bid+next.ask)/2});while(h[0]?.t<now-10000)h.shift();histories.set(x.symbol,h)}
    }
    if(m.channel==="book")for(const x of m.data||[]){
      if(!SYMBOLS.includes(x.symbol))continue;
      const book=m.type==="snapshot"?{bids:new Map(),asks:new Map()}:books.get(x.symbol);
      for(const l of x.bids||[]){const p=Number(l.price),q=Number(l.qty);q===0?book.bids.delete(p):book.bids.set(p,q)}
      for(const l of x.asks||[]){const p=Number(l.price),q=Number(l.qty);q===0?book.asks.delete(p):book.asks.set(p,q)}
      book.bids=new Map(side(book,"bids"));book.asks=new Map(side(book,"asks"));books.set(x.symbol,book);
    }
  });
  const retry=()=>{if(!online){} online=false;console.log("Kraken websocket disconnected; reconnect in",reconnectDelay);setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*2,30000)};
  ws.addEventListener("close",retry);
  ws.addEventListener("error",e=>{console.error("Kraken websocket error");try{ws.close()}catch{}});
}
connect();
setInterval(updateRows,250);
setInterval(()=>{try{tradeTick()}catch(e){console.error("tradeTick",e)}},250);
setInterval(persist,60000);
process.on("SIGTERM",()=>{persist();process.exit(0)});
process.on("uncaughtException",e=>console.error("uncaughtException",e));
process.on("unhandledRejection",e=>console.error("unhandledRejection",e));
