"use client";

const DB_NAME = "future-atlas";
const STORE = "history";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readDeviceHistory<T>(key: string): Promise<T | null> {
  try {
    const db = await database();
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
}

export async function writeDeviceHistory(key: string, value: unknown) {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* Device storage may be unavailable in private browsing. */ }
}

export async function deviceHistoryFor(userId: string) {
  try {
    const db = await database();
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const result: Record<string, unknown> = {};
      const request = db.transaction(STORE).objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(result);
        if (String(cursor.key).includes(userId)) result[String(cursor.key)] = cursor.value;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch { return {}; }
}

export async function clearDeviceHistory(userId: string) {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE, "readwrite").objectStore(STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (String(cursor.key).includes(userId)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch { /* Nothing to clear. */ }
}
