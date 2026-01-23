export type AbmeldungOption = {
  label: string;
  value: string;
  description: string;
};

export function abmeldungOptions(now: Date): readonly AbmeldungOption[] {
  const h = now.getHours();
  const opts: AbmeldungOption[] = [];

  // 🌙 Primetime
  opts.push({
    label: "🌙 Ganzer Abend abwesend",
    value: "evening_full",
    description: "Abmeldung für die gesamte Primetime (18–24 Uhr)",
  });

  if (h < 19) opts.push({ label: "⏰ Komme ab 19 Uhr", value: "late_19", description: "Verspätet" });
  if (h < 20) opts.push({ label: "⏰ Komme ab 20 Uhr", value: "late_20", description: "Verspätet" });
  if (h < 21) opts.push({ label: "⏰ Komme ab 21 Uhr", value: "late_21", description: "Verspätet" });
  if (h < 22) opts.push({ label: "⏰ Komme ab 22 Uhr", value: "late_22", description: "Verspätet" });
  if (h < 23) opts.push({ label: "⏰ Komme ab 23 Uhr", value: "late_23", description: "Verspätet" });

  // 📆 Langzeit
  opts.push(
    { label: "📆 1 Tag abwesend", value: "long_1", description: "1 Tag" },
    { label: "📆 2 Tage abwesend", value: "long_2", description: "2 Tage" },
    { label: "📆 3 Tage abwesend", value: "long_3", description: "3 Tage" },
    { label: "📆 4 Tage abwesend", value: "long_4", description: "4 Tage" },
    { label: "📆 5 Tage abwesend", value: "long_5", description: "5 Tage" },
    { label: "📆 6 Tage abwesend", value: "long_6", description: "6 Tage" },
    { label: "📆 7 Tage abwesend", value: "long_7", description: "7 Tage" },
    { label: "📆 7+ Tage abwesend", value: "long_7_plus", description: "Länger" }
  );

  return opts;
}
