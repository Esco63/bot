import { NextRequest, NextResponse } from "next/server";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { isPrimetime, lateOptions } from "@/lib/primetime";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const DISCORD_PUBLIC_KEY = mustEnv("DISCORD_PUBLIC_KEY");

type PingInteraction = { type: InteractionType.PING };
type CommandInteraction = {
  type: InteractionType.APPLICATION_COMMAND;
  data: { name: string };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const bodyText = await req.text();

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ok = verifyKey(bodyText, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction: unknown = JSON.parse(bodyText);

  /* ---------- PING ---------- */
  if (
    typeof interaction === "object" &&
    interaction !== null &&
    (interaction as PingInteraction).type === InteractionType.PING
  ) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  /* ---------- /abmeldung ---------- */
  if (
    typeof interaction === "object" &&
    interaction !== null &&
    (interaction as CommandInteraction).type === InteractionType.APPLICATION_COMMAND
  ) {
    const cmd = interaction as CommandInteraction;

    if (cmd.data.name === "abmeldung") {
      const now = new Date();

      if (!isPrimetime(now)) {
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "⛔ Abmeldung nur zwischen 18–24 Uhr möglich." },
        });
      }

      const options = [
        { label: "Ganzer Tag abwesend", value: "full_day" },
        ...lateOptions(now),
      ];

      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Bitte wähle deine Abmeldung:",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "abmeldung_select",
                  placeholder: "Abmeldung auswählen",
                  options,
                },
              ],
            },
          ],
        },
      });
    }
  }

  /* ---------- Fallback ---------- */
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "❓ Unbekannte Interaction" },
  });
}
