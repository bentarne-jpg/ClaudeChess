/* Norwegian display text for domain values. Pure functions, no DOM. */
import type { Evaluation, PgnError, TimeControl, TimeControlError } from "@sjakk/domain";

/** "+1.2", "−0.4", "M3", or the result when the game is over. */
export function evalText(ev: Evaluation | null | undefined): string {
  if (!ev) return "…";
  if (ev.mate === 0) return ev.winner === "w" ? "1–0" : ev.winner === "b" ? "0–1" : "½–½";
  if (ev.mate != null) return "M" + Math.abs(ev.mate);
  const v = (ev.cp ?? 0) / 100;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
}

/** Minutes with a decimal comma; under one minute in seconds ("30s"). */
export const formatMinutes = (m: number): string =>
  m >= 1 || m === 0 ? String(+m.toFixed(2)).replace(".", ",") : `${Math.round(m * 60)}s`;

/** Short label for a time control chip: "3+2". */
export const timeControlLabel = (t: TimeControl | null): string => (t ? `${formatMinutes(t.m)}+${t.i}` : "Ingen klokke");

/** Long description: "3 min + 2 s per trekk". */
export const timeControlLong = (t: TimeControl | null): string =>
  t ? `${t.m >= 1 ? formatMinutes(t.m) + " min" : Math.round(t.m * 60) + " s"}${t.i ? ` + ${t.i} s per trekk` : ""}` : "Ingen klokke";

export const timeControlErrorText = (e: TimeControlError): string =>
  e === "minutes" ? "Skriv inn mellom 0,25 og 180 minutter." : "Skriv inn mellom 0 og 180 sekunder per trekk.";

/** Clock display: tenths under 10 s, then m:ss or h:mm:ss. */
export function clockText(ms: number): string {
  if (ms === Infinity) return "–";
  ms = Math.max(0, ms);
  if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1).replace(".", ",");
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function pgnErrorText(e: PgnError): string {
  switch (e.code) {
    case "bad-fen": return "Startstillingen (FEN) i PGN-en er ugyldig.";
    case "too-long": return "PGN-en er for lang.";
    case "no-moves": return "Fant ingen trekk. Lim inn hele PGN-en, inkludert trekklisten.";
    case "illegal-move": {
      const { moveNumber, side, token } = e.detail;
      return `Trekk ${moveNumber}${side === "w" ? "." : "..."} «${token}» er ikke lovlig i stillingen. Sjekk at PGN-en er hel og ikke redigert.`;
    }
  }
}
