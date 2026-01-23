export function calculateEnd(value: string): Date {
  const now = new Date();

  if (value === "evening_full") {
    const end = new Date();
    end.setHours(24, 0, 0, 0);
    return end;
  }

  if (value.startsWith("late_")) {
    const hour = Number(value.replace("late_", ""));
    const end = new Date();
    end.setHours(hour, 0, 0, 0);
    return end;
  }

  if (value.startsWith("long_")) {
    const days = value === "long_7_plus" ? 14 : Number(value.replace("long_", ""));
    const end = new Date();
    end.setDate(end.getDate() + days);
    return end;
  }

  return now;
}
