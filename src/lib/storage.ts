// Browser storage that keeps working when the browser refuses to persist.
//
// Inside a frame on another site, or in a private window, localStorage can
// throw or be wiped when the session ends. Everything written here is also
// kept in memory, so the page behaves the same for as long as it stays open;
// only the "remembered next time" part is lost, and the site says so.

const memory = new Map<string, string>();
let persistent: boolean | undefined;

/** True when this browser lets the page keep data between visits. */
export const storagePersistent = (): boolean => {
  if (persistent === undefined) {
    try {
      const probe = 'satranc:probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      persistent = true;
    } catch {
      persistent = false;
    }
  }
  return persistent;
};

export const readText = (key: string): string | null => {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Stores (or with null removes) a value. Returns whether the browser kept it beyond this page. */
export const writeText = (key: string, value: string | null): boolean => {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    persistent = false;
    return false;
  }
};

export const readJson = <T>(key: string, fallback: T): T => {
  const raw = readText(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown): boolean => writeText(key, JSON.stringify(value));
