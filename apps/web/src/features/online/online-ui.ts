/*
 * Play a friend (feature: online). Challenge by link, accept, play with server-checked moves and
 * clocks; updates arrive by Realtime with polling as a fallback. Built with DOM APIs only (S7).
 */
import type { PvpState } from "@sjakk/contracts";
import { TIME_CONTROL_PRESETS, type TimeControl } from "@sjakk/domain";
import { clocksNow, statusText, type LivePort, type Online } from "../../core/online.ts";
import { clockText, timeControlLabel, timeControlLong } from "../../core/format.ts";
import { Board } from "../../ui/board.js";
import { PIECES } from "../../ui/pieces.js";
import { copyText } from "../../ui/copy.ts";
import "./online.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  e.append(...kids);
  return e;
}
const msgOf = (e: unknown) => {
  const code = (e as { code?: string }).code ?? "";
  return ({ "not-your-turn": "Det er ikke din tur.", "illegal-move": "Trekket er ikke lovlig.", "game-over": "Partiet er over.",
    conflict: "Noe er endret. Henter partiet på nytt.", "not-found": "Fant ikke partiet eller invitasjonen.", "rate-limited": "For mange forespørsler. Vent litt." } as Record<string, string>)[code]
    ?? "Fikk ikke kontakt med serveren. Prøver igjen.";
};

export function mountOnline(root: HTMLElement, deps: { online: Online | null; live: LivePort | null; signIn: () => void; enabled: boolean }) {
  const card = document.getElementById("h-venn");
  if (!deps.enabled) return;
  if (card) { card.hidden = false; (document.getElementById("h-ic-fr") as HTMLImageElement).src = PIECES.wrook!; }
  if (deps.online) { const st = document.getElementById("h-st-fr"); if (st) st.textContent = "Utfordre med en lenke"; }
  let stop = () => {};

  const show = (tab: string, args: string[]) => {
    stop(); stop = () => {};
    if (tab !== "venn") return;
    if (!deps.online) return renderSignedOut(args[0] ?? null);
    if (args[0] === "g" && args[1]) return renderGame(args[1]);
    if (args[0]) return renderJoin(args[0]);
    return renderLobby();
  };
  window.addEventListener("sjakk:route", (e) => { const d = (e as CustomEvent).detail; show(d.tab, d.args); });
  const seg = location.hash.slice(1).split("/");
  show(seg[0] ?? "", seg.slice(1));

  function renderSignedOut(invite: string | null) {
    const joining = !!invite && invite !== "g";
    root.replaceChildren(el("div", { className: "card", id: "ol-signedout" },
      el("h1", { textContent: joining ? "Du er invitert til et parti" : invite === "g" ? "Et parti mot en venn" : "Spill mot en venn" }),
      el("p", { textContent: joining
        ? "En venn har sendt deg en invitasjon til et parti sjakk. Logg inn for å se invitasjonen og bli med. Du kommer tilbake hit etterpå."
        : invite === "g" ? "Logg inn for å se og fortsette partiet." : "Logg inn for å utfordre en venn. Da lagres partiet og ratingen din." }),
      el("button", { type: "button", className: "btn primary", id: "ol-login", textContent: joining ? "Logg inn og bli med" : "Logg inn", onclick: deps.signIn })));
  }

  async function renderLobby() {
    const o = deps.online!;
    let tc: TimeControl | null = { m: 5, i: 3 }, color: "w" | "b" | "random" = "random", rated = true;
    const chips = el("div", { className: "ol-chips", id: "ol-tcs" });
    const drawChips = () => chips.replaceChildren(...[null, ...TIME_CONTROL_PRESETS.map(([m, i]) => ({ m, i }))].map((t) =>
      el("button", { type: "button", textContent: timeControlLabel(t), title: timeControlLong(t), ariaPressed: String(JSON.stringify(t) === JSON.stringify(tc)),
        onclick: () => { tc = t; drawChips(); } })));
    drawChips();
    const colors = el("div", { className: "ol-chips", id: "ol-color" });
    const drawColors = () => colors.replaceChildren(...(["w", "b", "random"] as const).map((c) =>
      el("button", { type: "button", textContent: { w: "Hvit", b: "Svart", random: "Tilfeldig" }[c], ariaPressed: String(c === color), onclick: () => { color = c; drawColors(); } })));
    drawColors();
    const ratedBox = el("input", { type: "checkbox", checked: true, id: "ol-rated", onchange: () => { rated = ratedBox.checked; } });
    const out = el("div", { id: "ol-invite" });
    const create = el("button", { type: "button", className: "btn primary", id: "ol-create", textContent: "Lag invitasjon" });
    create.onclick = async () => {
      create.disabled = true;
      try { const s = await o.create({ timeControl: tc, color, rated }); showInvite(s); } catch (e) { out.replaceChildren(el("p", { className: "msg err", textContent: msgOf(e) })); }
      finally { create.disabled = false; }
    };
    const showInvite = (s: PvpState) => {
      const link = `${location.href.split("#")[0]}#venn/${s.inviteCode}`;
      const field = el("input", { className: "ol-link", id: "ol-link", readOnly: true, value: link, ariaLabel: "Invitasjonslenke", onfocus: () => field.select() });
      const copied = el("p", { className: "msg", id: "ol-copied", role: "status" });
      out.replaceChildren(el("p", { textContent: "Send denne lenken til vennen din. Partiet starter når den godtas." }),
        field,
        el("div", { className: "ol-row" },
          el("button", { type: "button", className: "btn small", id: "ol-copy", textContent: "Kopier lenken", onclick: async () => {
            const r = await copyText(link, field);
            copied.className = r === "copied" ? "msg ok" : "msg";
            copied.textContent = r === "copied" ? "Lenken er kopiert. Lim den inn i en melding til vennen din." : "Lenken er markert. Kopier den med Ctrl+C (Cmd+C på Mac), eller hold fingeren på den på mobil.";
          } }),
          ...(navigator.share ? [el("button", { type: "button", className: "btn small", textContent: "Del", onclick: () => navigator.share({ title: "Sjakk?", url: link }).catch(() => {}) })] : []),
          el("button", { type: "button", className: "btn small", textContent: "Avbryt invitasjonen", onclick: async () => { await o.abort(s.id).catch(() => {}); out.replaceChildren(); } })),
        copied);
      waitFor(s.id);
    };
    const waitFor = (id: string) => {
      const check = async () => { try { const s = await o.state(id); if (s.status === "active") location.hash = `#venn/g/${id}`; } catch { /* keep waiting */ } };
      const unwatch = deps.live?.watch(id, check) ?? (() => {});
      const t = setInterval(check, 3000);
      stop = () => { unwatch(); clearInterval(t); };
    };
    const list = el("div", { className: "ol-list", id: "ol-list" });
    root.replaceChildren(
      el("div", { className: "card" }, el("h1", { textContent: "Spill mot en venn" }),
        el("p", { className: "hint", textContent: "Velg klokke og farge, og send lenken." }),
        chips, colors, el("label", { className: "ol-row" }, ratedBox, "Ratet parti"), el("div", { className: "ol-row" }, create), out),
      el("div", { className: "card" }, el("h2", { textContent: "Mine partier" }), list));
    try {
      const games = await o.list();
      list.replaceChildren(...(games.length ? games.map((g) => g.status === "open"
        ? el("a", { href: `#venn`, onclick: (e: Event) => { e.preventDefault(); showInvite({ id: g.id, inviteCode: g.inviteCode } as PvpState); } },
          el("span", { textContent: `Invitasjon ${timeControlLabel(g.timeControl)}` }), el("span", { textContent: "venter" }))
        : el("a", { href: `#venn/g/${g.id}` }, el("span", { textContent: `Mot ${g.opponent ?? "?"} (${timeControlLabel(g.timeControl)})` }), el("span", { textContent: "pågår →" })))
        : [el("p", { className: "hint", textContent: "Ingen partier i gang." })]));
    } catch (e) { list.replaceChildren(el("p", { className: "msg err", textContent: msgOf(e) })); }
  }

  async function renderJoin(code: string) {
    const o = deps.online!;
    root.replaceChildren(el("div", { className: "card" }, el("p", { textContent: "Henter invitasjonen …" })));
    try {
      const info = await o.info(code);
      if (info.status !== "open") { location.hash = `#venn/g/${info.gameId}`; return; }
      const colorText = info.color === "random" ? "tilfeldig farge" : info.color === "w" ? `${info.from} spiller hvit` : `${info.from} spiller svart`;
      const go = el("button", { type: "button", className: "btn primary", id: "ol-accept", textContent: "Godta og spill" });
      go.onclick = async () => { go.disabled = true; try { const s = await o.accept(code); location.hash = `#venn/g/${s.id}`; } catch (e) { go.disabled = false; msg.textContent = msgOf(e); } };
      const msg = el("p", { className: "msg err" });
      root.replaceChildren(el("div", { className: "card" }, el("h1", { textContent: info.yours ? "Din invitasjon" : `${info.from} utfordrer deg` }),
        el("p", { textContent: `${timeControlLong(info.timeControl)} · ${info.rated ? "ratet" : "uratet"} · ${colorText}` }),
        info.yours ? el("p", { textContent: "Send lenken til en venn. Du kan ikke godta din egen invitasjon." }) : go, msg));
    } catch (e) { root.replaceChildren(el("div", { className: "card" }, el("p", { className: "msg err", textContent: msgOf(e) }))); }
  }

  function renderGame(id: string) {
    const o = deps.online!;
    const boardEl = el("div", { className: "board", id: "ol-board" });
    const top = el("div", { className: "ol-player", id: "ol-top" }, el("span"), el("span", { className: "t" }));
    const bot = el("div", { className: "ol-player", id: "ol-bot" }, el("span"), el("span", { className: "t" }));
    const status = el("p", { className: "ol-status", id: "ol-status", role: "status" });
    const msg = el("p", { className: "msg", id: "ol-msg" });
    const moves = el("div", { className: "ol-moves", id: "ol-moves" });
    const btn = (id: string, text: string, fn: () => Promise<unknown>) => el("button", { type: "button", className: "btn small", id, textContent: text,
      onclick: async () => { try { apply(await fn() as PvpState); } catch (e) { msg.textContent = msgOf(e); void refresh(); } } });
    const resign = btn("ol-resign", "Gi opp", () => o.resign(id));
    const offer = btn("ol-draw", "Tilby remis", () => o.draw(id, "offer"));
    const accept = btn("ol-draw-yes", "Godta remis", () => o.draw(id, "accept"));
    const decline = btn("ol-draw-no", "Avslå", () => o.draw(id, "decline"));
    const abort = btn("ol-abort", "Avbryt partiet", () => o.abort(id));
    const actions = el("div", { className: "ol-row" }, offer, accept, decline, resign, abort);
    root.replaceChildren(el("div", { className: "ol-game" }, el("div", { className: "ol-side" }, top, boardEl, bot),
      el("div", { className: "ol-side" }, el("div", { className: "card" }, status, msg, actions), el("div", { className: "card" }, moves),
        el("a", { href: "#venn", className: "btn small", textContent: "Til lobbyen" }))));

    let s: PvpState | null = null, at = 0, claiming = false;
    const board = Board(boardEl, {
      onMove: async (from: string, to: string, promo?: string) => {
        if (!s) return;
        const uci = from + to + (promo ?? "");
        msg.textContent = "";
        try { apply(await o.move(id, uci, s.ply + 1)); } catch (e) { msg.textContent = msgOf(e); void refresh(); }
      },
    });
    const apply = (n: PvpState) => {
      if (s && n.ply < s.ply && n.status === s.status) return; // an older answer arrived late
      s = n; at = performance.now();
      const you = n.you ?? "w", opp = you === "w" ? "b" : "w";
      const turn = n.fen.split(" ")[1];
      const last = n.moves.at(-1);
      board.set({ fen: n.fen, flipped: you === "b", last: last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null,
        movable: n.status === "active" && turn === you ? you : null });
      top.firstElementChild!.textContent = opp === "w" ? n.white.name : n.black.name;
      bot.firstElementChild!.textContent = `${you === "w" ? n.white.name : n.black.name} (deg)`;
      status.textContent = statusText(n);
      const rc = n.ratingChange?.[you];
      if (rc) msg.textContent = `Rating (${rc.pool}): ${rc.before} → ${rc.after}`;
      moves.textContent = n.moves.map((m, i) => (i % 2 ? "" : `${i / 2 + 1}. `) + m.san).join(" ");
      const active = n.status === "active";
      offer.hidden = !active || n.drawOffer === you || n.drawOffer === opp;
      accept.hidden = decline.hidden = !(active && n.drawOffer === opp);
      resign.hidden = !active;
      abort.hidden = !(active && n.ply < 2);
      tick();
    };
    const tick = () => {
      if (!s) return;
      const c = clocksNow(s, at, performance.now()), you = s.you ?? "w", opp = you === "w" ? "b" : "w";
      for (const [box, side] of [[top, opp], [bot, you]] as const) {
        box.lastElementChild!.textContent = c ? clockText(c[side]) : "–";
        box.classList.toggle("on", s.status === "active" && s.clock?.running === side);
        box.classList.toggle("low", !!c && c[side] < 10_000 && s.status === "active");
      }
      // The opponent's flag fell: ask the server to end the game (it checks the time itself).
      if (c && s.status === "active" && s.clock?.running === opp && c[opp] <= 0 && !claiming) {
        claiming = true; o.claimTimeout(id).then(apply).catch(() => {}).finally(() => { claiming = false; });
      }
    };
    const refresh = async () => { try { apply(await o.state(id)); } catch (e) { msg.textContent = msgOf(e); } };
    const unwatch = deps.live?.watch(id, () => void refresh()) ?? (() => {});
    const poll = setInterval(() => { if (!s || s.status === "active" || s.status === "open") void refresh(); }, 4000);
    const clock = setInterval(tick, 200);
    stop = () => { unwatch(); clearInterval(poll); clearInterval(clock); };
    void refresh();
  }
}
