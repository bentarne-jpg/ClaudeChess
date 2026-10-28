"""Build dist/Sjakkverkstedet-offline.html: one self-contained file with the
engine, opening book and puzzles inlined, so it runs straight from disk
without a network connection.

Usage (from the repository root):  python3 tools/build_offline.py
"""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "dist" / "Sjakkverkstedet-offline.html"


def read(name):
    return (APP / name).read_text(encoding="utf-8")


def main():
    page = read("index.html")
    wasm = base64.b64encode((APP / "stockfish.wasm").read_bytes()).decode()
    # The page looks for window.OFFLINE: data comes from here instead of fetch(),
    # and the engine starts from a blob: URL. The wasm build gets its binary
    # in memory; the asm.js build is the fallback for browsers without WebAssembly.
    boot = f"""<script>
window.OFFLINE={{openings:{read("openings.json")},puzzles:{read("puzzles.json")},
  engineUrl(){{ if(this._u) return this._u;
    let src;
    if(typeof WebAssembly==="object"){{ const b64=document.getElementById("sf-wasm").textContent.trim();
      src="var __b=atob('"+b64+"'),__u=new Uint8Array(__b.length);for(var i=0;i<__b.length;i++)__u[i]=__b.charCodeAt(i);"+
          "self.XMLHttpRequest=function(){{var x=this;this.open=function(){{}};this.send=function(){{x.status=200;x.response=__u.buffer;x.responseText='';if(x.onload)x.onload()}};}};\\n"+
          document.getElementById("sf-js").textContent;
    }} else src=document.getElementById("sf-asm").textContent;
    this._u=URL.createObjectURL(new Blob([src],{{type:"text/javascript"}})); return this._u}}}};
</script>
<script type="text/plain" id="sf-js">{read("stockfish.js")}</script>
<script type="text/plain" id="sf-wasm">{wasm}</script>
<script type="text/plain" id="sf-asm">{read("stockfish.asm.js")}</script>
<script>{read("chess.js")}</script>
"""
    tag = '<script src="chess.js"></script>'
    assert page.count(tag) == 1, "app/index.html must load chess.js exactly once"
    page = page.replace(tag, boot)
    page = page.replace("<title>Sjakkverkstedet</title>", "<title>Sjakkverkstedet (offline)</title>")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
