import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { commands } from "../discord/commands";

const appId: string | undefined = process.env.DISCORD_APP_ID;
const token: string | undefined = process.env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
  console.error("DISCORD_APP_ID:", appId);
  console.error("DISCORD_BOT_TOKEN:", token ? "SET" : "MISSING");
  throw new Error("Missing Discord env vars");
}

async function register(): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/applications/${appId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }
  );

  if (!res.ok) {
    const text: string = await res.text();
    throw new Error(text);
  }

  console.log("✅ Commands registered");
}

register().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
