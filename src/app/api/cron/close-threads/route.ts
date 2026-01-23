export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("abmeldungen")
    .select("*")
    .lte("ends_at", now);

  if (!data) return NextResponse.json({ ok: true });

  for (const row of data) {
    await fetch(
      `https://discord.com/api/v10/channels/${row.thread_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archived: true }),
      }
    );

    await supabase.from("abmeldungen").delete().eq("id", row.id);
  }

  return NextResponse.json({ closed: data.length });
}
