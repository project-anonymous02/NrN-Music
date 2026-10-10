import "@testing-library/jest-dom/vitest";

/** jsdom is missing a handful of browser APIs the UI relies on. */

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: number[] = [];
  }

  window.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;
  window.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
  window.scrollTo = (() => {}) as typeof window.scrollTo;

  const urlApi = URL as unknown as {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (target: string) => void;
  };
  if (typeof urlApi.createObjectURL !== "function") {
    urlApi.createObjectURL = () => "blob:test";
    urlApi.revokeObjectURL = () => {};
  }
  if (!window.requestIdleCallback) {
    window.requestIdleCallback = ((cb: () => void) => setTimeout(cb, 0)) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = ((id: number) => clearTimeout(id)) as typeof window.cancelIdleCallback;
  }
}
