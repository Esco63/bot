type Option = { label: string; value: string };

export function primetimeOptions(now: Date): readonly Option[] {
  const h = now.getHours();
  const opts: Option[] = [];

  // immer möglich
  opts.push({ label: "Ganzer Abend (18–24) abwesend", value: "full_evening" });

  // Startzeiten nur, wenn sie noch kommen
  if (h < 19) opts.push({ label: "Komme ab 19 Uhr", value: "late_19" });
  if (h < 20) opts.push({ label: "Komme ab 20 Uhr", value: "late_20" });
  if (h < 21) opts.push({ label: "Komme ab 21 Uhr", value: "late_21" });
  if (h < 22) opts.push({ label: "Komme ab 22 Uhr", value: "late_22" });
  if (h < 23) opts.push({ label: "Komme ab 23 Uhr", value: "late_23" });

  return opts;
}
