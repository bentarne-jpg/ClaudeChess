/* A profile picture: one of the app's chess pieces on a coloured disc. */
import { PIECES } from "./pieces.js";

const BG: Record<string, string> = { green: "#5f8f62", blue: "#2f5d8a", amber: "#b9821c", violet: "#7a5bb5", red: "#b8442f", slate: "#55605b" };
const NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** `avatar` is "piece:<w|b><p|n|b|r|q|k>:<colour>", or null for the initial of the name. */
export function avatarEl(avatar: string | null, name: string, size = 40): HTMLElement {
  const el = document.createElement("span");
  el.className = "avatar";
  el.style.width = el.style.height = `${size}px`;
  const m = avatar ? /^piece:([wb])([pnbrqk]):(\w+)$/.exec(avatar) : null;
  if (m) {
    el.style.background = BG[m[3]!] ?? BG.slate!;
    const img = document.createElement("img");
    img.alt = "";
    img.src = PIECES[m[1]! + NAME[m[2]!]!]!;
    el.append(img);
  } else {
    el.style.background = BG.slate!;
    el.textContent = (name.trim()[0] ?? "?").toUpperCase();
    el.style.fontSize = `${Math.round(size * 0.45)}px`;
  }
  return el;
}
