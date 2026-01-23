export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";
import { abmeldungOptions } from "@/lib/abmeldung-options";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({}, { status: 500 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text(); // RAW BODY (sehr wichtig)

  if (!signature || !timestamp) {
    return NextResponse.json({}, { status: 401 });
  }

  const isValid = await verifyKey(body, signature, timestamp, publicKey);
  if (!isValid) {
    return NextResponse.json({}, { status: 401 });
  }

  const interaction = JSON.parse(body);

  /* ---------- PING ---------- */
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({
      type: InteractionResponseType.PONG,
    });
  }

  /* ---------- /abmeldung ---------- */
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (interaction.data.name === "abmeldung") {
      const options = abmeldungOptions(new Date());

      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "📝 **Abmeldung auswählen**",
          flags: 64, // ephemeral
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
  }

  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "OK" },
  });
}
