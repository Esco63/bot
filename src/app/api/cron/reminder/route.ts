export const runtime = "nodejs";

import { NextResponse } from "next/server";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_ABMELDUNG_CHANNEL_ID;

export async function GET(): Promise<NextResponse> {
  if (!DISCORD_BOT_TOKEN || !CHANNEL_ID) {
    return NextResponse.json({ error: "Missing env" }, { status: 500 });
  }

  const message =
    "🌅 **Guten Morgen!**\n\n" +
    "📌 **Bitte vergesst euch nicht abzumelden.**\n" +
    "⏰ Ihr habt **bis 18:00 Uhr Zeit**, euch abzumelden.\n" +
    "⚠️ **Wer nicht abgemeldet ist, zählt als *unabgemeldet*.**";

  await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: message }),
  });

  return NextResponse.json({ ok: true });
}
