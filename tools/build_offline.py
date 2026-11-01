"""Build dist/Sjakkverkstedet-offline.html: one self-contained file with the app, fonts, engine,
opening book and puzzles inlined, so it runs straight from disk without a network connection.

Run after `npm run build` (from the repository root):  python3 tools/build_offline.py
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web" / "dist"
OUT = ROOT / "dist" / "Sjakkverkstedet-offline.html"


def text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def inline_css(css: str, folder: Path) -> str:
    # Keep only woff2 sources (every current browser) and embed them.
    css = re.sub(r",\s*url\([^)]*\.woff\)\s*format\(['\"]woff['\"]\)", "", css)
    def embed(m):
        data = base64.b64encode((folder / m.group(1)).read_bytes()).decode()
        return f"url(data:font/woff2;base64,{data})"
    return re.sub(r"url\(\.?/?(?:assets/)?([^)'\"]+\.woff2)\)", embed, css)


def safe_script(js: str) -> str:
    return js.replace("</script", "<\\/script")


def main():
    page = text(WEB / "index.html")
    assets = WEB / "assets"
    page = re.sub(r'<link rel="modulepreload"[^>]*>\s*', "", page)
    # The offline file gets its own policy: everything is inline, and it may not use the network at all.
    page, n_csp = re.subn(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '<meta http-equiv="Content-Security-Policy" content="'
        "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src blob:; "
        "style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src blob: data:; base-uri 'none'; form-action 'none'\">", page)
    assert n_csp == 1, "the built page must carry a Content-Security-Policy"

    def css_tag(m):
        return "<style>" + inline_css(text(WEB / m.group(1)), assets) + "</style>"
    page, n_css = re.subn(r'<link rel="stylesheet"[^>]*href="\./([^"]+)"[^>]*>', css_tag, page)

    def js_tag(m):
        return '<script type="module">' + safe_script(text(WEB / m.group(1))) + "</script>"
    page, n_js = re.subn(r'<script type="module"[^>]*src="\./([^"]+)"[^>]*></script>', js_tag, page)
    assert n_css >= 1 and n_js == 1, (n_css, n_js)

    wasm = base64.b64encode((WEB / "stockfish.wasm").read_bytes()).decode()
    # The app looks for window.OFFLINE: data comes from here instead of fetch(), and the engine
    # starts from a blob: URL. The wasm build gets its binary in memory; the asm.js build is the
    # fallback for browsers without WebAssembly.
    boot = f"""<script>
window.OFFLINE={{openings:{text(WEB / "openings.json")},puzzles:{text(WEB / "puzzles.json")},
  engineUrl(){{ if(this._u) return this._u;
    let src;
    if(typeof WebAssembly==="object"){{ const b64=document.getElementById("sf-wasm").textContent.trim();
      src="var __b=atob('"+b64+"'),__u=new Uint8Array(__b.length);for(var i=0;i<__b.length;i++)__u[i]=__b.charCodeAt(i);"+
          "self.XMLHttpRequest=function(){{var x=this;this.open=function(){{}};this.send=function(){{x.status=200;x.response=__u.buffer;x.responseText='';if(x.onload)x.onload()}};}};\\n"+
          document.getElementById("sf-js").textContent;
    }} else src=document.getElementById("sf-asm").textContent;
    this._u=URL.createObjectURL(new Blob([src],{{type:"text/javascript"}})); return this._u}}}};
</script>
<script type="text/plain" id="sf-js">{safe_script(text(WEB / "stockfish.js"))}</script>
<script type="text/plain" id="sf-wasm">{wasm}</script>
<script type="text/plain" id="sf-asm">{safe_script(text(WEB / "stockfish.asm.js"))}</script>
"""
    page = page.replace("</head>", boot + "</head>", 1)
    page = page.replace("<title>Sjakkverkstedet</title>", "<title>Sjakkverkstedet (offline)</title>")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
