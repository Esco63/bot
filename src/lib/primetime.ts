export function isPrimetime(date: Date): boolean {
  const h = date.getHours();
  return h >= 18 && h < 24;
}

export function lateOptions(date: Date): readonly { label: string; value: string }[] {
  const h = date.getHours();
  const opts: { label: string; value: string }[] = [];

  if (h < 19) opts.push({ label: "Komme ab 19 Uhr", value: "late_19" });
  if (h < 20) opts.push({ label: "Komme ab 20 Uhr", value: "late_20" });
  if (h < 21) opts.push({ label: "Komme ab 21 Uhr", value: "late_21" });
  if (h < 22) opts.push({ label: "Komme ab 22 Uhr", value: "late_22" });
  if (h < 23) opts.push({ label: "Komme ab 23 Uhr", value: "late_23" });

  return opts;
}
