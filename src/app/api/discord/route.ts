export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";
import { primetimeOptions, longOptions } from "@/lib/abmeldung-options";

/* ─────────────── TYPES ─────────────── */

type BaseInteraction = {
  id: string;
  application_id: string;
  channel_id: string;
  token: string;
  type: InteractionType;
};

type ApplicationCommandInteraction = BaseInteraction & {
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

/* ─────────────── HANDLER ─────────────── */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!publicKey) return NextResponse.json({}, { status: 500 });

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text(); // RAW BODY

  if (!signature || !timestamp) {
    return NextResponse.json({}, { status: 401 });
  }

  const isValid = await verifyKey(body, signature, timestamp, publicKey);
  if (!isValid) {
    return NextResponse.json({}, { status: 401 });
  }

  const interaction = JSON.parse(body) as BaseInteraction;

  /* ─────────────── PING ─────────────── */
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({
      type: InteractionResponseType.PONG,
    });
  }

  /* ─────────────── /abmeldung ─────────────── */
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    (interaction as ApplicationCommandInteraction).data.name === "abmeldung"
  ) {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "📝 **Abmeldung auswählen**",
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

  /* ─────────────── SELECT HANDLER ─────────────── */
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
      select.member.nick ||
      select.member.user.username;

    /* ───── Antwort senden ───── */
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: "✅ Abmeldung registriert",
              color: 0x22c55e,
              fields: [
                { name: "👤 User", value: displayName, inline: true },
                { name: "📌 Abmeldung", value: description, inline: true },
              ],
              footer: { text: "Diese Nachricht verschwindet automatisch ⏳" },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      }
    );

    /* ───── Nachricht nach 1h löschen ───── */
    if (botToken && response.ok) {
      const message = await response.json();

      setTimeout(async () => {
        try {
          await fetch(
            `https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${message.id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bot ${botToken}`,
              },
            }
          );
        } catch (err) {
          console.error("Auto-Delete fehlgeschlagen:", err);
        }
      }, 60 * 60 * 1000); // 1 Stunde
    }

    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
    });
  }

  return NextResponse.json({ status: "ok" });
}
