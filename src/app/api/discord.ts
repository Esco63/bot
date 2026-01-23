import type { NextApiRequest, NextApiResponse } from "next";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: "Missing public key" });
  }

  // Discord testet GET
  if (req.method === "GET") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const signature = req.headers["x-signature-ed25519"] as string | undefined;
  const timestamp = req.headers["x-signature-timestamp"] as string | undefined;

  if (!signature || !timestamp) {
    return res.status(401).end();
  }

  const rawBody = JSON.stringify(req.body);

  const isValid = verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return res.status(401).end();
  }

  const interaction = req.body;

  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({
      type: InteractionResponseType.PONG,
    });
  }

  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "OK" },
  });
}
