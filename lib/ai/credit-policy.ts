export function secondsUntilKolkataMidnight(now = Date.now()) {
  return Math.ceil((86_400_000 - ((now + 19_800_000) % 86_400_000)) / 1000);
}

export function creditQuarters(mode: string, payload?: Record<string, unknown>) {
  if (mode !== "mentor") return 4;
  const length = typeof payload?.response === "string" ? payload.response.length : 0;
  return length <= 400 ? 1 : length <= 900 ? 2 : length <= 1600 ? 3 : 4;
}
