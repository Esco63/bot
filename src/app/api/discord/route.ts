import { NextRequest, NextResponse } from "next/server";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const DISCORD_PUBLIC_KEY = mustEnv("DISCORD_PUBLIC_KEY");

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const bodyText = await req.text();

  if (!signature || !timestamp) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const ok = verifyKey(bodyText, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const interaction: unknown = JSON.parse(bodyText);

  if (
    typeof interaction === "object" &&
    interaction !== null &&
    "type" in interaction &&
    (interaction as { type: number }).type === InteractionType.PING
  ) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "✅ Endpoint läuft. Nächster Schritt: Commands registrieren." },
  });
}
