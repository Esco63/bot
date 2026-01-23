export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";

import { primetimeOptions, longOptions } from "@/lib/abmeldung-options";
import { calculateEnd } from "@/lib/abmeldung-end";
import { supabase } from "@/lib/supabase";

/* ───────────── TYPES ───────────── */

type BaseInteraction = {
  id: string;
  application_id: string;
  channel_id: string;
  token: string;
  type: InteractionType;
};

type CommandInteraction = BaseInteraction & {
  type: InteractionType.APPLICATION_COMMAND;
  data: { name: string };
};

type SelectInteraction = BaseInteraction & {
  type: InteractionType.MESSAGE_COMPONENT;
  data: {
    custom_id: string;
    values: string[];
  };
  member: {
    nick?: string;
    user: {
      id: string;
      username: string;
    };
  };
};

/* ───────────── HANDLER ───────────── */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!publicKey || !botToken) {
    return NextResponse.json({}, { status: 500 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text();

  if (!signature || !timestamp) {
    return NextResponse.json({}, { status: 401 });
  }

  const valid = await verifyKey(body, signature, timestamp, publicKey);
  if (!valid) {
    return NextResponse.json({}, { status: 401 });
  }

  const interaction = JSON.parse(body) as BaseInteraction;

  /* ───── PING ───── */
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  /* ───── /abmeldung ───── */
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    (interaction as CommandInteraction).data.name === "abmeldung"
  ) {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "📝 **Abmeldung auswählen**",
        flags: 64,
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
      },
    });
  }

  /* ───── SELECT ───── */
  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    (interaction as SelectInteraction).data.custom_id.startsWith("abmeldung_")
  ) {
    const select = interaction as SelectInteraction;
    const selectedValue = select.data.values[0];

    const allOptions = [
      ...primetimeOptions(new Date()),
      ...longOptions(),
    ];

    const option = allOptions.find(o => o.value === selectedValue);
    const description = option?.description ?? selectedValue;

    const displayName =
      select.member.nick ?? select.member.user.username;

    const endAt = calculateEnd(selectedValue);

    /* 🧵 THREAD ERSTELLEN */
    const threadRes = await fetch(
      `https://discord.com/api/v10/channels/${interaction.channel_id}/threads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: displayName,
          auto_archive_duration: 1440,
        }),
      }
    );

    const thread = await threadRes.json();

    /* 📌 THREAD INFO */
    await fetch(
      `https://discord.com/api/v10/channels/${thread.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: [
            {
              title: "📝 Abmeldung",
              color: 0xf59e0b,
              fields: [
                { name: "👤 User", value: displayName },
                { name: "📌 Art", value: description },
                {
                  name: "⏰ Abgemeldet bis",
                  value: endAt.toLocaleString("de-DE"),
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      }
    );

    /* 💾 SUPABASE */
    await supabase.from("abmeldungen").insert({
      discord_user_id: select.member.user.id,
      discord_name: displayName,
      thread_id: thread.id,
      channel_id: interaction.channel_id,
      abmeldung_typ: selectedValue,
      ends_at: endAt.toISOString(),
    });

    /* ✅ BESTÄTIGUNG */
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 64,
        embeds: [
          {
            title: "✅ Abmeldung registriert",
            color: 0x22c55e,
            fields: [
              { name: "👤 User", value: displayName, inline: true },
              { name: "📌 Abmeldung", value: description, inline: true },
            ],
            footer: {
              text: "Der Thread wurde automatisch erstellt 🧵",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
  }

  return NextResponse.json({ status: "ok" });
}
