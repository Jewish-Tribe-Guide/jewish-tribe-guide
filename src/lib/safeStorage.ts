// localStorage that never throws. Safari's "Block all cookies" makes the
// mere read of `window.localStorage` throw a SecurityError, and a full or
// private-mode store throws on write. What the site remembers is a
// convenience, so a blocked store reads as empty and a write is dropped.
// Before this, the Map page and the home showed "Something went wrong"
// (Nov 18).

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Blocked or full: not remembered.
  }
}
