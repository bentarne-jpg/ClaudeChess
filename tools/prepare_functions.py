"""Copy the shared TypeScript packages and the puzzle set into supabase/functions/_shared, where the
Edge Function bundler can reach them. Run before `supabase functions serve` or `deploy`.
The copies are generated (git-ignored); the packages stay the single source (manifest P1)."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "supabase" / "functions" / "_shared"


def main():
    for pkg in ("domain", "contracts", "server"):
        dst = SHARED / pkg
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(ROOT / "packages" / pkg / "src", dst, ignore=shutil.ignore_patterns("*.d.ts"))
    shutil.copy2(ROOT / "apps" / "web" / "public" / "puzzles.json", SHARED / "puzzles.json")
    print(f"Prepared {SHARED.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
