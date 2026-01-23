export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { primetimeOptions, longOptions } from "@/lib/abmeldung-options";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_ABMELDUNG_CHANNEL_ID;

async function postPanel(): Promise<Response> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    return NextResponse.json({ error: "Missing env" }, { status: 500 });
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content:
          "📝 **Abmeldung – bitte auswählen**\n\n" +
          "🌙 Primetime (18–24 Uhr)\n" +
          "📆 Längere Abmeldungen\n\n" +
          "⏰ **Abmeldung bis 18:00 Uhr empfohlen**",
        components: [
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "abmeldung_prime",
                placeholder: "🌙 Primetime (18–24 Uhr)",
                options: primetimeOptions(new Date()),
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "abmeldung_long",
                placeholder: "📆 Längere Abmeldung",
                options: longOptions(),
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: t }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* ✅ Browser / Cron */
export async function GET() {
  return postPanel();
}

/* ✅ Cron / API */
export async function POST() {
  return postPanel();
}
