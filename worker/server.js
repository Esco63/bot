import http from "node:http";
import WebSocket from "ws";
import pg from "pg";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const SYMBOLS = ["BTC/EUR", "ETH/EUR", "SOL/EUR"];
const FEE_PCT = Number(process.env.FEE_PCT || "0.8");
const TARGET_NET_PCT = Number(process.env.TARGET_NET_PCT || "0.25");
const STOP_NET_PCT = Number(process.env.STOP_NET_PCT || "-3");
const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || "75");
const MAX_POSITION_EUR = Number(process.env.MAX_POSITION_EUR || "20");
const MAX_POSITIONS = Number(process.env.MAX_POSITIONS || "2");
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || "20000");
const MAX_HOLD_MS = Number(process.env.MAX_HOLD_MS || String(6 * 60 * 60 * 1000));
const STARTING_CAPITAL_EUR = Number(process.env.STARTING_CAPITAL_EUR || "100");
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const emptyBook = () => ({ bids: new Map(), asks: new Map() });
const books = new Map(SYMBOLS.map((s) => [s, emptyBook()]));
const ticks = new Map();
const histories = new Map(SYMBOLS.map((s) => [s, []]));
const lastTradeAt = new Map();
let online = false;
let startedAt = Date.now();
let latestRows = [];
let ws = null;
let reconnectDelay = 1000;
let reconnectTimer = null;

let paper = {
  running: true,
  cash: STARTING_CAPITAL_EUR,
  initial: STARTING_CAPITAL_EUR,
  fees: 0,
  positions: [],
  trades: [],
};

const uid = () => Date.now() + "-" + Math.random().toString(36).slice(2);
const pct = (a, b) => (b ? (a / b - 1) * 100 : 0);

function sortedSide(book, key) {
  const source = key === "bids" ? book.bids : book.asks;
  return [...source.entries()]
    .sort((a, b) => (key === "bids" ? b[0] - a[0] : a[0] - b[0]))
    .slice(0, 10);
}

function simulateBuy(book, budget) {
  const asks = sortedSide(book, "asks");
  if (!asks.length) return null;
  const feeRate = FEE_PCT / 100;
  const grossBudget = budget / (1 + feeRate);
  let left = grossBudget, qty = 0, cost = 0;
  for (const [price, volume] of asks) {
    const use = Math.min(left, price * volume);
    qty += use / price;
    cost += use;
    left -= use;
    if (left < 1e-9) break;
  }
  if (!qty) return null;
  const fee = cost * feeRate;
  return { qty, cost, fee, total: cost + fee, vwap: cost / qty, fill: cost / grossBudget };
}

function simulateSell(book, wantedQty) {
  const bids = sortedSide(book, "bids");
  if (!bids.length) return null;
  const feeRate = FEE_PCT / 100;
  let left = wantedQty, qty = 0, gross = 0;
  for (const [price, volume] of bids) {
    const use = Math.min(left, volume);
    qty += use;
    gross += use * price;
    left -= use;
    if (left < 1e-12) break;
  }
  if (!qty) return null;
  const fee = gross * feeRate;
  return { qty, gross, fee, net: gross - fee, vwap: gross / qty, fill: qty / wantedQty };
}

function priceAgo(history, targetTime) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].t <= targetTime) return history[i].p;
  }
  return null;
}

function imbalance(book) {
  const bids = sortedSide(book, "bids").slice(0, 5);
  const asks = sortedSide(book, "asks").slice(0, 5);
  if (!bids.length || !asks.length) return null;
  const bidVol = bids.reduce((n, x) => n + x[1], 0);
  const askVol = asks.reduce((n, x) => n + x[1], 0);
  return bidVol + askVol ? (bidVol - askVol) / (bidVol + askVol) : 0;
}

function calcScore(m1, m3, m5, obi, spread) {
  const norm = (v, scale) => (v == null ? 0 : Math.tanh(v / scale));
  let x = norm(m1, 0.025) * 35 + norm(m3, 0.05) * 25 + norm(m5, 0.08) * 20 + (obi ?? 0) * 25;
  if (spread != null) x -= Math.min(spread / 0.1, 1) * 10;
  return Math.max(-100, Math.min(100, Math.round(x)));
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_state (
      id INTEGER PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const { rows } = await pool.query("SELECT state FROM paper_state WHERE id = 1");
  if (rows[0]?.state) {
    paper = rows[0].state;
    if (typeof paper.running !== "boolean") paper.running = true;
  } else {
    await persist();
  }
}

async function persist() {
  await pool.query(
    `INSERT INTO paper_state (id, state, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [JSON.stringify(paper)]
  );
}

function updateRows() {
  const now = Date.now();
  latestRows = SYMBOLS.map((symbol) => {
    const tick = ticks.get(symbol) || {};
    const bid = tick.bid ?? null;
    const ask = tick.ask ?? null;
    const mid = bid && ask ? (bid + ask) / 2 : null;
    const h = histories.get(symbol) || [];
    const mom = (seconds) => {
      const prev = priceAgo(h, now - seconds * 1000);
      return mid && prev ? pct(mid, prev) : null;
    };
    const m1 = mom(1), m3 = mom(3), m5 = mom(5);
    const obi = imbalance(books.get(symbol) || emptyBook());
    const spread = mid && bid && ask ? ((ask - bid) / mid) * 100 : null;
    return { symbol, bid, ask, spread, m1, m3, m5, obi, score: calcScore(m1, m3, m5, obi, spread) };
  });
}

function currentEquity() {
  let equity = paper.cash;
  for (const p of paper.positions) {
    const fill = simulateSell(books.get(p.symbol) || emptyBook(), p.qty);
    equity += fill && fill.fill >= 0.999 ? fill.net : p.cost;
  }
  return equity;
}

async function tradingTick() {
  if (!paper.running || !online) return;
  const now = Date.now();
  let changed = false;

  for (const p of [...paper.positions]) {
    const book = books.get(p.symbol);
    if (!book) continue;
    const fill = simulateSell(book, p.qty);
    if (!fill || fill.fill < 0.999) continue;
    const pnl = fill.net - p.cost;
    const netPct = pct(fill.net, p.cost);
    let reason = "";
    if (netPct >= TARGET_NET_PCT) reason = "Gewinnziel";
    else if (netPct <= STOP_NET_PCT) reason = "Stop-Loss";
    else if (now - p.openedAt >= MAX_HOLD_MS) reason = "Zeitlimit";
    if (!reason) continue;

    paper.cash += fill.net;
    paper.fees += fill.fee;
    paper.positions = paper.positions.filter((x) => x.id !== p.id);
    paper.trades.unshift({
      ...p,
      closedAt: now,
      exit: fill.vwap,
      sellFee: fill.fee,
      pnl,
      pct: netPct,
      reason,
    });
    paper.trades = paper.trades.slice(0, 1000);
    lastTradeAt.set(p.symbol, now);
    changed = true;
  }

  if (paper.positions.length < MAX_POSITIONS) {
    const candidates = [...latestRows].sort((a, b) => b.score - a.score);
    for (const row of candidates) {
      if (paper.positions.some((p) => p.symbol === row.symbol)) continue;
      if (now - (lastTradeAt.get(row.symbol) || 0) < COOLDOWN_MS) continue;
      if (
        row.score < SCORE_THRESHOLD ||
        (row.spread ?? 9) > 0.1 ||
        (row.m1 ?? -1) <= 0 ||
        (row.m3 ?? -1) <= 0 ||
        (row.m5 ?? -1) <= 0 ||
        (row.obi ?? -1) <= 0
      ) continue;

      const budget = Math.min(paper.cash, MAX_POSITION_EUR);
      if (budget < 5) break;
      const book = books.get(row.symbol);
      if (!book) continue;
      const fill = simulateBuy(book, budget);
      if (!fill || fill.fill < 0.999) continue;

      paper.cash -= fill.total;
      paper.fees += fill.fee;
      paper.positions.push({
        id: uid(),
        symbol: row.symbol,
        openedAt: now,
        entry: fill.vwap,
        qty: fill.qty,
        cost: fill.total,
        buyFee: fill.fee,
        score: row.score,
      });
      lastTradeAt.set(row.symbol, now);
      changed = true;
      break;
    }
  }

  if (changed) await persist();
}

function connectKraken() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket("wss://ws.kraken.com/v2");

  ws.on("open", () => {
    online = true;
    reconnectDelay = 1000;
    ws.send(JSON.stringify({
      method: "subscribe",
      params: { channel: "ticker", symbol: SYMBOLS, event_trigger: "bbo", snapshot: true }
    }));
    ws.send(JSON.stringify({
      method: "subscribe",
      params: { channel: "book", symbol: SYMBOLS, depth: 10, snapshot: true }
    }));
  });

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    const now = Date.now();

    if (m.channel === "ticker") {
      for (const x of m.data || []) {
        if (!SYMBOLS.includes(x.symbol)) continue;
        const prev = ticks.get(x.symbol) || {};
        const next = { ...prev };
        if (x.bid != null) next.bid = Number(x.bid);
        if (x.ask != null) next.ask = Number(x.ask);
        ticks.set(x.symbol, next);
        if (next.bid && next.ask) {
          const h = histories.get(x.symbol) || [];
          h.push({ t: now, p: (next.bid + next.ask) / 2 });
          while (h[0]?.t < now - 10000) h.shift();
          histories.set(x.symbol, h);
        }
      }
    }

    if (m.channel === "book") {
      for (const x of m.data || []) {
        if (!SYMBOLS.includes(x.symbol)) continue;
        const book = m.type === "snapshot" ? emptyBook() : (books.get(x.symbol) || emptyBook());
        for (const level of x.bids || []) {
          const price = Number(level.price), qty = Number(level.qty);
          if (qty === 0) book.bids.delete(price); else book.bids.set(price, qty);
        }
        for (const level of x.asks || []) {
          const price = Number(level.price), qty = Number(level.qty);
          if (qty === 0) book.asks.delete(price); else book.asks.set(price, qty);
        }
        book.bids = new Map(sortedSide(book, "bids"));
        book.asks = new Map(sortedSide(book, "asks"));
        books.set(x.symbol, book);
      }
    }
  });

  const reconnect = () => {
    online = false;
    reconnectTimer = setTimeout(connectKraken, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };
  ws.on("close", reconnect);
  ws.on("error", () => { try { ws.close(); } catch {} });
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-headers": "content-type,x-control-token",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  return CONTROL_TOKEN && req.headers["x-control-token"] === CONTROL_TOKEN;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, online, running: paper.running, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) });
  }

  if (req.method === "GET" && url.pathname === "/state") {
    const equity = currentEquity();
    return json(res, 200, {
      online,
      serverTime: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      config: {
        feePct: FEE_PCT,
        targetNetPct: TARGET_NET_PCT,
        stopNetPct: STOP_NET_PCT,
        scoreThreshold: SCORE_THRESHOLD,
        maxPositionEur: MAX_POSITION_EUR,
        maxPositions: MAX_POSITIONS,
      },
      paper,
      equity,
      pnl: equity - paper.initial,
      rows: latestRows,
    });
  }

  if (req.method === "POST" && url.pathname.startsWith("/control/")) {
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
    const action = url.pathname.split("/").pop();
    if (action === "start") paper.running = true;
    else if (action === "pause") paper.running = false;
    else if (action === "reset") {
      paper = { running: false, cash: STARTING_CAPITAL_EUR, initial: STARTING_CAPITAL_EUR, fees: 0, positions: [], trades: [] };
      lastTradeAt.clear();
    } else return json(res, 404, { error: "unknown_action" });
    await persist();
    return json(res, 200, { ok: true, running: paper.running });
  }

  return json(res, 404, { error: "not_found" });
});

await initDb();
connectKraken();
setInterval(updateRows, 250);
setInterval(() => tradingTick().catch((err) => console.error("tradingTick", err)), 250);
setInterval(() => persist().catch((err) => console.error("persist", err)), 60000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`kraken-paper-worker listening on :${PORT}`);
});
