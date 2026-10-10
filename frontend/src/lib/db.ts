/**
 * Minimal IndexedDB key/value layer.
 *
 * NrNMusic stores structured data (playlists, history, queue, settings), which
 * does not belong in localStorage: it is synchronous, size limited and cannot
 * hold typed structures safely. When IndexedDB is unavailable (private mode,
 * tests) an in-memory map keeps the app usable for the session.
 */

export const DB_NAME = "nrnmusic";
export const DB_VERSION = 1;
export const STORES = ["settings", "library", "history", "queue", "meta", "local"] as const;

export type StoreName = (typeof STORES)[number];

const memory = new Map<string, unknown>();
const memoryKey = (store: StoreName, key: string) => `${store}::${key}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory.get(memoryKey(store, key)) as T | undefined;
  return new Promise<T | undefined>((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.set(memoryKey(store, key), value);
    return;
  }
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.delete(memoryKey(store, key));
    return;
  }
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb();
  if (!db) {
    for (const key of [...memory.keys()]) if (key.startsWith(`${store}::`)) memory.delete(key);
    return;
  }
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Rough storage estimate for the Settings > Storage panel. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
