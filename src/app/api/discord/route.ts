export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { InteractionType, InteractionResponseType, verifyKey } from "discord-interactions";

export async function POST(req: NextRequest) {
  console.log("HIT /api/discord");

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  console.log("HAS_KEY", Boolean(publicKey));

  const sig = req.headers.get("x-signature-ed25519");
  const ts = req.headers.get("x-signature-timestamp");
  console.log("HEADERS", { sig: Boolean(sig), ts: Boolean(ts) });

  const body = await req.text();
  console.log("BODY", body);

  if (!publicKey || !sig || !ts) {
    return NextResponse.json({}, { status: 401 });
  }

  const valid = verifyKey(body, sig, ts, publicKey);
  console.log("VALID", valid);

  if (!valid) {
    return NextResponse.json({}, { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "OK" },
  });
}
