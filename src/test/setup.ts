import "@testing-library/jest-dom";

// jsdom этой сборки не даёт localStorage, а код приложения на него опирается —
// без подмены такие тесты падают на ровном месте. Хранилище в памяти ведёт себя
// как настоящее и очищается вместе с окружением каждого файла тестов.
if (!("localStorage" in window) || !window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(window, "localStorage", { writable: true, value: memoryStorage });
  Object.defineProperty(globalThis, "localStorage", { writable: true, value: memoryStorage });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
