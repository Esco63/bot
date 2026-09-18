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
