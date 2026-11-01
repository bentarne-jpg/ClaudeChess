/* Entry point. Fonts are served from our own origin (manifest S8). */
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import "./legacy/app.js";
import { accountContext } from "./composition.ts";
import { mountAccount } from "./features/account/account-ui.ts";
import { mountOnline } from "./features/online/online-ui.ts";

accountContext().then(({ config, account, online, live }) => {
  const slot = document.getElementById("acct-slot");
  if (slot) mountAccount(slot, config, account);
  const venn = document.getElementById("tab-venn");
  if (venn) mountOnline(venn, { online, live, enabled: !!config.supabase && !!account, signIn: () => document.getElementById("acct-btn")?.click() });
});
