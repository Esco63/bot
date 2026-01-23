export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";
import { abmeldungOptions } from "@/lib/abmeldung-options";

/* ─────────────── TYPES ─────────────── */

type BaseInteraction = {
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
    user: {
      id: string;
      username: string;
    };
  };
};

/* ─────────────── HANDLER ─────────────── */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({}, { status: 500 });
  }

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
    const options = abmeldungOptions(new Date());

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
                custom_id: "abmeldung_select",
                placeholder: "Art der Abmeldung auswählen …",
                options,
              },
            ],
          },
        ],
      },
    });
  }

  /* ─────────────── SELECT MENU ─────────────── */
  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    (interaction as SelectInteraction).data.custom_id === "abmeldung_select"
  ) {
    const select = interaction as SelectInteraction;
    const value = select.data.values[0];
    const user = select.member.user;

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 64,
        embeds: [
          {
            title: "✅ Abmeldung registriert",
            color: 0x22c55e,
            fields: [
              { name: "👤 User", value: user.username, inline: true },
              { name: "📌 Auswahl", value: value.replaceAll("_", " "), inline: true },
            ],
            footer: { text: "Danke für deine Abmeldung 👍" },
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
  }

  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "OK" },
  });
}
