/*
 * Login button and account dialog (feature: account). Built with DOM APIs only (manifest S7).
 * Shown only when accounts are configured for this channel.
 */
import type { Account } from "../../core/account.ts";
import type { AppConfig, Provider } from "../../core/config.ts";
import "./account.css";

const PROVIDER_LABEL: Record<Provider, string> = { google: "Fortsett med Google", facebook: "Fortsett med Facebook", "custom:vipps": "Fortsett med Vipps" };
const POOL_LABEL: Record<string, string> = { puzzle: "Sjakknøtter", bot: "Mot bot", bullet: "Bullet", blitz: "Blitz", rapid: "Hurtigsjakk", classical: "Langsjakk" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  e.append(...kids);
  return e;
}

export function mountAccount(slot: HTMLElement, config: AppConfig, account: Account | null) {
  if (!config.supabase || !account) { slot.hidden = true; return; }
  const btn = el("button", { type: "button", className: "acctbtn", id: "acct-btn" }, el("span", { textContent: account.session ? "Min konto" : "Logg inn" }));
  slot.replaceChildren(btn);
  const dlg = el("dialog", { className: "acctdlg", id: "acct-dlg" });
  document.body.append(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  btn.onclick = () => { (account.session ? renderProfile : renderLogin)(); dlg.showModal(); };
  if (account.session) account.overview().then((o) => { btn.firstElementChild!.textContent = o.displayName; }).catch(() => {});

  function renderLogin() {
    const list = el("div", { className: "providers" });
    const msg = el("p", { className: "msg" });
    for (const p of config.providers) {
      list.append(el("button", { type: "button", className: p === "custom:vipps" ? "vipps" : "", textContent: PROVIDER_LABEL[p],
        onclick: async () => { msg.textContent = "Sender deg videre …"; try { await account!.signIn(p); } catch { msg.textContent = "Innloggingen startet ikke. Prøv igjen."; } } }));
    }
    if (!config.providers.length) list.append(el("p", { textContent: "Ingen innloggingsmåter er slått på ennå." }));
    dlg.replaceChildren(
      el("h2", { textContent: "Logg inn" }),
      el("p", { textContent: "Med en konto lagres ratingen og partiene dine, og du kan bruke dem på alle enhetene dine. Vi lagrer ikke passord." }),
      el("p", {}, el("a", { href: "personvern.html", textContent: "Les hva som lagres (personvern)" })),
      list, msg,
      el("div", { className: "row" }, el("button", { type: "button", className: "btn small", textContent: "Avbryt", onclick: () => dlg.close() })),
    );
  }

  async function renderProfile() {
    const msg = el("p", { className: "msg" });
    const name = el("input", { id: "acct-name", maxLength: 40 });
    const ratings = el("div", { className: "ratings" });
    dlg.replaceChildren(el("h2", { textContent: "Min konto" }), el("p", { textContent: "Henter …" }));
    let o: Awaited<ReturnType<Account["overview"]>>;
    try { o = await account!.overview(); } catch { dlg.replaceChildren(el("h2", { textContent: "Min konto" }), el("p", { textContent: "Fikk ikke kontakt med serveren." })); return; }
    name.value = o.displayName;
    if (!o.ratings.length) ratings.append(el("span", { textContent: "Ingen rating ennå. Løs nøtter eller spill mot boten." }));
    for (const r of o.ratings) ratings.append(el("span", { textContent: POOL_LABEL[r.pool] ?? r.pool }), el("span", { className: "n", textContent: String(r.rating) }), el("span", { className: "g", textContent: `${r.games} ${r.pool === "puzzle" ? "nøtter" : "partier"}` }));
    const del = el("button", { type: "button", className: "btn small danger", textContent: "Slett kontoen" });
    del.onclick = () => {
      const confirm = el("input", { placeholder: "Skriv SLETT", id: "acct-del-confirm" });
      const go = el("button", { type: "button", className: "btn small danger", textContent: "Slett for godt", id: "acct-del-go" });
      go.onclick = async () => {
        if (confirm.value.trim() !== "SLETT") { msg.textContent = "Skriv SLETT for å bekrefte."; return; }
        msg.textContent = "Sletter …"; try { await account!.deleteAccount(); } catch { msg.textContent = "Kunne ikke slette. Prøv igjen."; }
      };
      del.replaceWith(el("label", { textContent: "Kontoen, ratingen og lagrede partier slettes. Partier mot andre beholdes uten navnet ditt." }, confirm), go);
    };
    dlg.replaceChildren(
      el("h2", { textContent: "Min konto" }),
      el("label", { textContent: "Visningsnavn" }, name),
      ratings,
      el("div", { className: "row" },
        el("button", { type: "button", className: "btn small primary", textContent: "Lagre navn", onclick: async () => {
          try { await account!.rename(name.value); btn.firstElementChild!.textContent = name.value.trim() || "Spiller"; msg.textContent = "Lagret."; } catch { msg.textContent = "Kunne ikke lagre."; } } }),
        el("button", { type: "button", className: "btn small", textContent: "Last ned mine data", onclick: async () => {
          try {
            const data = await account!.exportData();
            const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: "sjakkverkstedet-mine-data.json" });
            a.click(); URL.revokeObjectURL(a.href);
          } catch { msg.textContent = "Kunne ikke hente dataene."; } } }),
        el("button", { type: "button", className: "btn small", textContent: "Logg ut", onclick: () => account!.signOut() }),
      ),
      el("div", { className: "row" }, del, el("a", { href: "personvern.html", className: "btn small", textContent: "Personvern" })),
      msg,
      el("div", { className: "row" }, el("button", { type: "button", className: "btn small", textContent: "Lukk", onclick: () => dlg.close() })),
    );
  }
}
