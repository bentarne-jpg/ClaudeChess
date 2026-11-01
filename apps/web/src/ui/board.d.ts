export declare function Board(el: HTMLElement, opts?: { onMove?: (from: string, to: string, promo?: string) => void }): {
  set(state: Record<string, unknown>): void;
};
