/** Opening table: position key (first three FEN fields) → [ECO code, name]. */
export type OpeningTable = Record<string, [string, string]>;
export interface OpeningInfo { name: string | null; eco: string | null; book: boolean[] }

export const openingKey = (fen: string): string => fen.split(" ").slice(0, 3).join(" ");

/**
 * Name the opening of a game. `fens[0]` is the start position. Every ply up to the deepest named
 * position counts as book; the search gives up after 8 plies in a row without a named position.
 */
export function openingInfo(fens: readonly string[], table: OpeningTable | null): OpeningInfo {
  if (!table) return { name: null, eco: null, book: [] };
  let name: string | null = null, eco: string | null = null, last = 0, miss = 0;
  for (let i = 1; i < fens.length && i <= 50; i++) {
    const o = table[openingKey(fens[i]!)];
    if (o) { name = o[1]; eco = o[0]; last = i; miss = 0; } else if (++miss > 8) break;
  }
  const book: boolean[] = [];
  for (let i = 1; i <= last; i++) book[i] = true;
  return { name, eco, book };
}
