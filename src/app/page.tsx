"use client";
import {useEffect,useMemo,useState} from "react";

const WORKER="https://paper-worker-runtime-production.up.railway.app";

type Row={symbol:string;bid:number|null;ask:number|null;spread:number|null;m1:number|null;m3:number|null;m5:number|null;obi:number|null;score:number};
type Position={id:string;symbol:string;openedAt:number;entry:number;qty:number;cost:number;buyFee:number;score:number};
type Trade=Position&{closedAt:number;exit:number;sellFee:number;pnl:number;pct:number;reason:string};
type Paper={running:boolean;cash:number;initial:number;fees:number;positions:Position[];trades:Trade[]};
type State={online:boolean;serverTime:number;uptimeSeconds:number;config:{feePct:number;targetNetPct:number;stopNetPct:number;scoreThreshold:number;maxPositionEur:number;maxPositions:number};paper:Paper;equity:number;pnl:number;rows:Row[]};
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};

const eur=(n:number)=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(n);
const fmt=(n:number|null)=>n==null?"–":new Intl.NumberFormat("de-DE",{maximumFractionDigits:6}).format(n);
const signed=(n:number|null,d=3)=>n==null?"–":(n>0?"+":"")+n.toFixed(d)+"%";
const age=(s:number)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+"h "+m+"m":m+"m"};

export default function Home(){
  const[data,setData]=useState<State|null>(null);
  const[error,setError]=useState("");
  const[install,setInstall]=useState<InstallPromptEvent|null>(null);
  const[standalone,setStandalone]=useState(false);

  useEffect(()=>{
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    const nav=navigator as Navigator&{standalone?:boolean};
    setStandalone(window.matchMedia("(display-mode: standalone)").matches||nav.standalone===true);
    const onPrompt=(e:Event)=>{e.preventDefault();setInstall(e as InstallPromptEvent)};
    window.addEventListener("beforeinstallprompt",onPrompt);
    return()=>window.removeEventListener("beforeinstallprompt",onPrompt);
  },[]);

  useEffect(()=>{
    let dead=false;
    const load=async()=>{
      try{
        const r=await fetch(WORKER+"/state",{cache:"no-store"});
        if(!r.ok)throw new Error("HTTP "+r.status);
        const j=await r.json() as State;
        if(!dead){setData(j);setError("")}
      }catch{
        if(!dead)setError("24/7-Worker gerade nicht erreichbar");
      }
    };
    load();
    const t=setInterval(load,1000);
    return()=>{dead=true;clearInterval(t)};
  },[]);

  const rows=useMemo(()=>[...(data?.rows??[])].sort((a,b)=>b.score-a.score),[data]);
  const paper=data?.paper;
  const pnl=data?.pnl??0;

  const installApp=async()=>{
    if(!install)return;
    await install.prompt();
    await install.userChoice;
    setInstall(null);
  };

  return <main>
    <header>
      <div>
        <small>KRAKEN · 24/7 · PAPER ONLY</small>
        <h1>Second Trend Paper Bot</h1>
        <p>Der Bot läuft serverseitig auf Railway weiter, auch wenn dein Handy gesperrt ist. Das Dashboard liest denselben persistenten Paper-Kontostand aus PostgreSQL.</p>
      </div>
      <aside className={data?.online&&paper?.running?"ok":"bad"}>● {data?.online?(paper?.running?"Worker läuft 24/7":"Worker pausiert"):"Verbinde Worker…"}</aside>
    </header>

    {error&&<section className="panel alert"><b>{error}</b><span>Das Dashboard versucht automatisch erneut zu verbinden.</span></section>}

    <section className="cards">
      <b>{eur(data?.equity??100)}<span className={pnl>=0?"up":"down"}>{pnl>=0?"+":""}{eur(pnl)}</span></b>
      <b>{eur(paper?.cash??100)}<span>freies Cash</span></b>
      <b>{paper?.positions.length??0}<span>offene Positionen</span></b>
      <b>{eur(paper?.fees??0)}<span>simulierte Gebühren</span></b>
    </section>

    <section className="panel bar">
      <div>
        <h2>24/7 Paper Engine</h2>
        <p>Kauf ab Score ≥ {data?.config.scoreThreshold??75}, max. {eur(data?.config.maxPositionEur??20)} pro Position, Gewinnziel +{data?.config.targetNetPct??0.25}% netto, Stop {data?.config.stopNetPct??-3}%. Gebührenmodell {data?.config.feePct??0.8}% pro Ausführung.</p>
      </div>
      <div className="statusStack">
        <span className="pill">{data?.online?"Kraken verbunden":"Kraken offline"}</span>
        <span className="pill">Uptime {age(data?.uptimeSeconds??0)}</span>
      </div>
    </section>

    {!standalone&&<section className="panel installBox">
      <div>
        <h2>Auf den Homebildschirm</h2>
        <p>{install?"Du kannst die Webapp direkt installieren.":"iPhone/iPad: In Safari „Teilen“ → „Zum Home-Bildschirm“. Danach öffnet sie sich wie eine App."}</p>
      </div>
      {install&&<button className="primary" onClick={installApp}>App installieren</button>}
    </section>}

    <section className="panel">
      <h2>Live Scanner</h2>
      <div className="scroll"><table>
        <thead><tr><th>Markt</th><th>Bid / Ask</th><th>Spread</th><th>1s</th><th>3s</th><th>5s</th><th>OBI</th><th>Score</th></tr></thead>
        <tbody>{rows.map(r=><tr key={r.symbol}>
          <td><b>{r.symbol}</b></td>
          <td>{fmt(r.bid)} / {fmt(r.ask)}</td>
          <td>{r.spread==null?"–":r.spread.toFixed(3)+"%"}</td>
          <td className={(r.m1??0)>=0?"up":"down"}>{signed(r.m1)}</td>
          <td className={(r.m3??0)>=0?"up":"down"}>{signed(r.m3)}</td>
          <td className={(r.m5??0)>=0?"up":"down"}>{signed(r.m5)}</td>
          <td className={(r.obi??0)>=0?"up":"down"}>{r.obi==null?"–":r.obi.toFixed(2)}</td>
          <td><strong className={r.score>=75?"hot":r.score<=-75?"cold":""}>{r.score>0?"+":""}{r.score}</strong></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="two">
      <section className="panel">
        <h2>Offene Positionen</h2>
        {paper?.positions.length?paper.positions.map(p=><article key={p.id}>
          <div><b>{p.symbol}</b><span>Entry {fmt(p.entry)} · {eur(p.cost)} · Score {p.score}</span></div>
          <b>{Math.max(0,Math.floor((Date.now()-p.openedAt)/1000))}s</b>
        </article>):<p className="empty">Aktuell keine offene Position.</p>}
      </section>
      <section className="panel">
        <h2>Letzte Trades</h2>
        {paper?.trades.length?paper.trades.slice(0,12).map((t,i)=><article key={t.id+i}>
          <div><b>{t.symbol}</b><span>{t.reason} · {fmt(t.entry)} → {fmt(t.exit)} · {signed(t.pct,2)}</span></div>
          <b className={t.pnl>=0?"up":"down"}>{t.pnl>=0?"+":""}{eur(t.pnl)}</b>
        </article>):<p className="empty">Noch keine abgeschlossenen Trades.</p>}
      </section>
    </section>

    <footer>Nur Paper Trading: keine Kraken-API-Schlüssel, keine echten Orders, kein echtes Geld. Serverzustand wird dauerhaft gespeichert.</footer>
  </main>
}