/* Types for chess.js 0.10.3 (the library ships none). Only what the app uses. */
declare module "chess.js" {
  export type Color = "w" | "b";
  export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
  export interface Move {
    color: Color; from: string; to: string; flags: string; piece: PieceType;
    san: string; captured?: PieceType; promotion?: PieceType;
  }
  export interface ChessInstance {
    fen(): string;
    turn(): Color;
    move(m: string | { from: string; to: string; promotion?: string }, opts?: { sloppy?: boolean }): Move | null;
    moves(): string[];
    moves(opts: { verbose: true; square?: string }): Move[];
    undo(): Move | null;
    history(): string[];
    history(opts: { verbose: true }): Move[];
    load(fen: string): boolean;
    load_pgn(pgn: string, opts?: { sloppy?: boolean }): boolean;
    pgn(opts?: { max_width?: number; newline_char?: string }): string;
    header(...args: string[]): Record<string, string>;
    get(square: string): { type: PieceType; color: Color } | null;
    board(): ({ type: PieceType; color: Color } | null)[][];
    in_check(): boolean; in_checkmate(): boolean; in_stalemate(): boolean; in_draw(): boolean;
    in_threefold_repetition(): boolean; insufficient_material(): boolean; game_over(): boolean;
    validate_fen(fen: string): { valid: boolean; error_number: number; error: string };
  }
  export const Chess: { new (fen?: string): ChessInstance; (fen?: string): ChessInstance };
}
