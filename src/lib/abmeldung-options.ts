export type AbmeldungOption = {
  label: string;
  value: string;
  description: string;
};

export function primetimeOptions(now: Date): readonly AbmeldungOption[] {
  const h = now.getHours();
  const opts: AbmeldungOption[] = [];

  opts.push({
    label: "🌙 Ganzer Abend abwesend",
    value: "evening_full",
    description: "Abwesend während der gesamten Primetime (18–24 Uhr)",
  });

  if (h < 19) opts.push({ label: "⏰ Komme ab 19 Uhr", value: "late_19", description: "Komme ab 19 Uhr zur Primetime" });
  if (h < 20) opts.push({ label: "⏰ Komme ab 20 Uhr", value: "late_20", description: "Komme ab 20 Uhr zur Primetime" });
  if (h < 21) opts.push({ label: "⏰ Komme ab 21 Uhr", value: "late_21", description: "Komme ab 21 Uhr zur Primetime" });
  if (h < 22) opts.push({ label: "⏰ Komme ab 22 Uhr", value: "late_22", description: "Komme ab 22 Uhr zur Primetime" });
  if (h < 23) opts.push({ label: "⏰ Komme ab 23 Uhr", value: "late_23", description: "Komme ab 23 Uhr zur Primetime" });

  return opts;
}

export function longOptions(): readonly AbmeldungOption[] {
  return [
    { label: "📆 1 Tag abwesend", value: "long_1", description: "Abmeldung für 1 Tag" },
    { label: "📆 3 Tage abwesend", value: "long_3", description: "Abmeldung für 3 Tage" },
    { label: "📆 5 Tage abwesend", value: "long_5", description: "Abmeldung für 5 Tage" },
    { label: "📆 7 Tage abwesend", value: "long_7", description: "Abmeldung für 7 Tage" },
    { label: "📆 7+ Tage abwesend", value: "long_7_plus", description: "Längere Abmeldung (manuell)" },
  ];
}
