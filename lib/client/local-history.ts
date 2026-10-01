import { clearDeviceHistory, deviceHistoryFor, writeDeviceHistory } from "@/lib/client/device-history";

const contextKey = (userId?: string) => `future-atlas:study-context:${userId || "guest"}`;

export function saveToolContext(mode: string, inputs: Record<string, string>, result: unknown, userId?: string) {
  const current = readToolContextItems(userId);
  current.push({ mode, inputs, result, at: new Date().toISOString() });
  localStorage.setItem(contextKey(userId), JSON.stringify(current.slice(-8)));
  void writeDeviceHistory(contextKey(userId), current.slice(-50));
}

function readToolContextItems(userId?: string) {
  try { return JSON.parse(localStorage.getItem(contextKey(userId)) || "[]") as Array<Record<string, unknown>>; }
  catch { return []; }
}

export function readToolContext(userId?: string) {
  return JSON.stringify(readToolContextItems(userId).slice(-3)).slice(0, 4_000);
}

export async function accountHistorySnapshot(userId: string) {
  const data: Record<string, unknown> = { local: {}, session: {} };
  for (const [name, storage] of [["local", localStorage], ["session", sessionStorage]] as const) {
    const target = data[name] as Record<string, unknown>;
    for (const key of Object.keys(storage)) {
      if (key.includes(userId)) {
        try { target[key] = JSON.parse(storage.getItem(key) || "null"); }
        catch { target[key] = storage.getItem(key); }
      }
    }
  }
  data.indexedDb = await deviceHistoryFor(userId);
  return data;
}

export async function clearAccountHistory(userId: string) {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) if (key.includes(userId)) storage.removeItem(key);
  }
  await clearDeviceHistory(userId);
}
