/*
 * Copy text to the clipboard. The modern clipboard API is refused in some browsers and embedded views,
 * so fall back to selecting the text and the older copy command; if that fails too, the text is left
 * selected for the person to copy themselves.
 */
export type CopyResult = "copied" | "selected";

export async function copyText(text: string, field: HTMLInputElement): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return "copied"; }
  } catch { /* fall through to the old way */ }
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  try { if (document.execCommand("copy")) return "copied"; } catch { /* not supported */ }
  return "selected";
}
