/*
 * Login button and account dialog (feature: account). Built with DOM APIs only (manifest S7).
 * Shown only when accounts are configured for this channel.
 */
import type { Account } from "../../core/account.ts";
import { avatarEl } from "../../ui/avatar.ts";
import type { AppConfig, Provider } from "../../core/config.ts";
import "./account.css";

const PROVIDER_LABEL: Record<Provider, string> = { google: "Fortsett med Google", facebook: "Fortsett med Facebook", "custom:vipps": "Fortsett med Vipps" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  e.append(...kids);
  return e;
}

export function mountAccount(slot: HTMLElement, config: AppConfig, account: Account | null): { showMe(name: string, avatar: string | null): void } {
  const showMe = (name: string, avatar: string | null) => {
    const b = document.getElementById("acct-btn");
    if (b) b.replaceChildren(avatarEl(avatar, name, 24), el("span", { textContent: name }));
  };
  if (!config.supabase || !account) { slot.hidden = true; return { showMe }; }
  const btn = el("button", { type: "button", className: "acctbtn", id: "acct-btn" }, el("span", { textContent: account.session ? "Min konto" : "Logg inn" }));
  slot.replaceChildren(btn);
  const dlg = el("dialog", { className: "acctdlg", id: "acct-dlg" });
  document.body.append(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  // Signed in, the button leads to the profile page; signed out, it opens the login choices.
  btn.onclick = () => { if (account.session) { location.hash = "#profil"; return; } renderLogin(); dlg.showModal(); };
  if (account.session) account.overview().then((o) => showMe(o.displayName, o.avatar)).catch(() => {});

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
  return { showMe };
}
