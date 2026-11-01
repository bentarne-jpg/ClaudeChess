/*
 * The profile page (#profil): name, profile picture, ratings, development over time, activity, and
 * account actions (download data, sign out, delete). Built with DOM APIs only (manifest S7).
 */
import { AVATAR_COLOURS, AVATAR_PIECES, type Account, type Stats } from "../../core/account.ts";
import { avatarEl } from "../../ui/avatar.ts";
import { lineChart, weekBars } from "../../ui/chart.ts";
import "./profile.css";

const POOL: Record<string, string> = { puzzle: "Sjakknøtter", bot: "Mot bot", bullet: "Bullet", blitz: "Lynsjakk", rapid: "Hurtigsjakk", classical: "Langsjakk" };
const LINE_COLOUR: Record<string, string> = { puzzle: "var(--m-pz, #b9821c)", bot: "var(--m-pl, #5f8f62)", bullet: "#b8442f", blitz: "#7a5bb5", rapid: "#2f5d8a", classical: "#55605b" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  e.append(...kids);
  return e;
}

export function mountProfile(root: HTMLElement, account: Account | null, onChanged: (name: string, avatar: string | null) => void) {
  const show = (tab: string) => { if (tab === "profil") void render(); };
  window.addEventListener("sjakk:route", (e) => show((e as CustomEvent).detail.tab));
  show(location.hash.slice(1).split("/")[0] ?? "");

  async function render() {
    if (!account?.session) {
      root.replaceChildren(el("div", { className: "card" }, el("h1", { textContent: "Min profil" }),
        el("p", { textContent: "Logg inn for å se profilen din, ratingen og utviklingen over tid." }),
        el("button", { type: "button", className: "btn primary", textContent: "Logg inn", onclick: () => document.getElementById("acct-btn")?.click() })));
      return;
    }
    root.replaceChildren(el("div", { className: "card" }, el("p", { textContent: "Henter profilen …" })));
    let o, st: Stats;
    try { [o, st] = await Promise.all([account.overview(), account.stats()]); }
    catch { root.replaceChildren(el("div", { className: "card" }, el("p", { className: "msg err", textContent: "Fikk ikke hentet profilen. Prøv igjen om litt." }))); return; }
    let avatar = o.avatar, name = o.displayName;
    const msg = el("p", { className: "msg", id: "pf-msg", role: "status" });

    // --- name and picture ---
    const head = el("div", { className: "pf-head" });
    const drawHead = () => head.replaceChildren(avatarEl(avatar, name, 64), el("div", { className: "who" },
      el("h1", { id: "pf-name", textContent: name }),
      el("span", { className: "since", textContent: o.memberSince ? `Medlem siden ${new Date(o.memberSince).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}` : "" })));
    drawHead();
    const nameInput = el("input", { id: "pf-name-input", value: name, maxLength: 40, ariaLabel: "Visningsnavn" });
    const saveName = el("button", { type: "button", className: "btn small primary", id: "pf-save-name", textContent: "Lagre navn", onclick: async () => {
      try { await account.rename(nameInput.value); name = nameInput.value.trim().slice(0, 40) || "Spiller"; drawHead(); onChanged(name, avatar); msg.className = "msg ok"; msg.textContent = "Navnet er lagret."; }
      catch { msg.className = "msg err"; msg.textContent = "Kunne ikke lagre navnet."; } } });

    let piece = avatar?.split(":")[1] ?? "wn", colour = avatar?.split(":")[2] ?? "green";
    const pieces = el("div", { className: "pf-pieces", id: "pf-pieces" }), colours = el("div", { className: "pf-colours", id: "pf-colours" });
    const drawPicker = () => {
      pieces.replaceChildren(...AVATAR_PIECES.map((p) => el("button", { type: "button", ariaLabel: `Brikke ${p}`, ariaPressed: String(p === piece), onclick: () => { piece = p; drawPicker(); } },
        avatarEl(`piece:${p}:${colour}`, name, 40))));
      colours.replaceChildren(...AVATAR_COLOURS.map((c) => { const b = el("button", { type: "button", ariaLabel: `Farge ${c}`, ariaPressed: String(c === colour), onclick: () => { colour = c; drawPicker(); } }, el("span"));
        (b.firstElementChild as HTMLElement).style.background = (avatarEl(`piece:wp:${c}`, "", 1)).style.background; return b; }));
    };
    drawPicker();
    const savePic = el("button", { type: "button", className: "btn small primary", id: "pf-save-avatar", textContent: "Bruk dette bildet", onclick: async () => {
      try { avatar = `piece:${piece}:${colour}`; await account.setAvatar(avatar); drawHead(); onChanged(name, avatar); msg.className = "msg ok"; msg.textContent = "Profilbildet er lagret."; }
      catch { msg.className = "msg err"; msg.textContent = "Kunne ikke lagre profilbildet."; } } });
    const noPic = el("button", { type: "button", className: "btn small", textContent: "Bruk forbokstaven", onclick: async () => {
      try { avatar = null; await account.setAvatar(null); drawHead(); onChanged(name, null); msg.className = "msg ok"; msg.textContent = "Profilbildet er fjernet."; } catch { /* keep */ } } });

    // --- ratings ---
    const ratings = el("div", { className: "pf-ratings", id: "pf-ratings" });
    if (!st.ratings.length) ratings.append(el("p", { className: "pf-empty", textContent: "Ingen rating ennå. Løs nøtter eller spill et parti, så dukker den opp her." }));
    for (const r of st.ratings) ratings.append(el("div", { className: "pf-rating" },
      el("div", { className: "l", textContent: POOL[r.pool] ?? r.pool }), el("div", { className: "n", textContent: String(r.rating) }),
      el("div", { className: "s", textContent: r.pool === "puzzle" ? `${r.wins} løst · ${r.losses} ikke løst · best ${r.best}` : `${r.wins}–${r.draws}–${r.losses} (s–u–t) · best ${r.best}` })));

    // --- development over time ---
    const series = [{ name: "puzzle", colour: LINE_COLOUR.puzzle!, points: st.puzzles.points }];
    for (const pool of [...new Set(st.games.points.map((p) => p.pool))]) series.push({ name: pool, colour: LINE_COLOUR[pool] ?? "#55605b", points: st.games.points.filter((p) => p.pool === pool) });
    const shown = series.filter((s) => s.points.length);
    const dev = el("div", { className: "card", id: "pf-dev" }, el("h2", { textContent: "Utvikling" }));
    if (shown.length) {
      dev.append(el("div", { className: "pf-legend" }, ...shown.map((s) => { const i = el("i"); i.style.background = s.colour; return el("span", {}, i, POOL[s.name] ?? s.name); })));
      dev.append(lineChart(shown, { label: "Ratingen over tid" }));
    } else dev.append(el("p", { className: "pf-empty", textContent: "Grafen viser ratingen din over tid når du har løst noen nøtter eller spilt ratede partier." }));

    // --- activity ---
    const act = el("div", { className: "card", id: "pf-activity" }, el("h2", { textContent: "Aktivitet de siste 12 ukene" }));
    const iA = el("i"), iB = el("i"); iA.style.background = LINE_COLOUR.puzzle!; iB.style.background = LINE_COLOUR.bot!;
    act.append(el("div", { className: "pf-legend" }, el("span", {}, iA, "Nøtter"), el("span", {}, iB, "Partier")),
      weekBars(st.weeks.map((w) => ({ week: w.week, a: w.puzzles, b: w.games })), { a: "Nøtter", b: "Partier", colourA: LINE_COLOUR.puzzle!, colourB: LINE_COLOUR.bot!, label: "Nøtter og partier per uke" }));
    const rate = st.puzzles.attempts ? Math.round((st.puzzles.solved / st.puzzles.attempts) * 100) : 0;
    act.append(el("div", { className: "pf-totals" },
      el("span", {}, el("b", { textContent: String(st.puzzles.attempts) }), " nøtter, ", el("b", { textContent: `${rate} %` }), " løst"),
      el("span", {}, el("b", { textContent: String(st.games.total) }), ` partier (${st.games.bot} mot bot, ${st.games.pvp} mot venner)`),
      el("span", {}, el("b", { textContent: `${st.games.wins}–${st.games.draws}–${st.games.losses}` }), " seier–remis–tap")));

    // --- account ---
    const del = el("button", { type: "button", className: "btn small pf-danger", id: "pf-delete", textContent: "Slett kontoen" });
    del.onclick = () => {
      const confirm = el("input", { placeholder: "Skriv SLETT", id: "pf-del-confirm" });
      const go = el("button", { type: "button", className: "btn small pf-danger", id: "pf-del-go", textContent: "Slett for godt", onclick: async () => {
        if (confirm.value.trim() !== "SLETT") { msg.className = "msg err"; msg.textContent = "Skriv SLETT for å bekrefte."; return; }
        msg.className = "msg"; msg.textContent = "Sletter …"; try { await account.deleteAccount(); } catch { msg.className = "msg err"; msg.textContent = "Kunne ikke slette. Prøv igjen."; } } });
      del.replaceWith(el("p", { textContent: "Kontoen, ratingen og de lagrede partiene dine slettes. Partier mot andre beholdes uten navnet ditt." }), el("div", { className: "pf-row" }, confirm, go));
    };
    const download = el("button", { type: "button", className: "btn small", textContent: "Last ned mine data", onclick: async () => {
      try {
        const data = await account.exportData();
        const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: "sjakkverkstedet-mine-data.json" });
        a.click(); URL.revokeObjectURL(a.href);
      } catch { msg.className = "msg err"; msg.textContent = "Kunne ikke hente dataene."; } } });

    root.replaceChildren(
      el("div", { className: "card" }, head, el("div", { className: "pf-row" }, nameInput, saveName), msg),
      el("div", { className: "card" }, el("h2", { textContent: "Rating" }), ratings),
      dev, act,
      el("div", { className: "card" }, el("h2", { textContent: "Profilbilde" }), pieces, colours, el("div", { className: "pf-row" }, savePic, noPic)),
      el("div", { className: "card" }, el("h2", { textContent: "Konto" }),
        el("div", { className: "pf-row" }, download, el("a", { className: "btn small", href: "personvern.html", textContent: "Personvern" }),
          el("button", { type: "button", className: "btn small", id: "pf-signout", textContent: "Logg ut", onclick: () => account.signOut() })),
        el("div", { className: "pf-row" }, del)),
    );
  }
}
