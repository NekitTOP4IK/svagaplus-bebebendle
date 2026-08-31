import "@testing-library/jest-dom";

// Node 25+ ships a global localStorage accessor that stays disabled unless
// --localstorage-file is provided, and being non-writable it shadows the one
// jsdom installs. Tests only need the Web Storage surface, so fall back to a
// minimal in-memory implementation when no usable storage is present.
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length(): number {
        return store.size;
      },
      key(index: number): string | null {
        return [...store.keys()][index] ?? null;
      },
      getItem(key: string): string | null {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string): void {
        store.set(key, String(value));
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      clear(): void {
        store.clear();
      },
    },
  });
}
