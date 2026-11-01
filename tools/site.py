#!/usr/bin/env python3
"""Assemble the GitHub Pages site kept on the `site` branch (checked out in ./site).

Layout:
  /                  production (the current release)
  /releases/vX.Y.Z/  every released version, kept forever
  /next/             staging: the latest main
  /dev/<name>/       one preview per dev/<name> branch
  /versions.json     what is live, every release, and the production history

Usage: tools/site.py <build-dir> <channel> [version]
  channel = production | rollback | next | dev/<name> | remove-dev/<name>
"""
import datetime, json, re, shutil, sys
from pathlib import Path

RESERVED = {"releases", "next", "dev", "versions.json", ".nojekyll", ".git"}


def replace_dir(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def replace_root(site: Path, src: Path) -> None:
    """Make `src` the production root, leaving the reserved folders alone."""
    for p in site.iterdir():
        if p.name not in RESERVED:
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    for p in src.iterdir():
        (shutil.copytree if p.is_dir() else shutil.copy2)(p, site / p.name)


def vkey(v: str):
    return [int(x) for x in v.lstrip("v").split(".")]


def main(build: str, channel: str, version: str = "", site_dir: str = "site") -> None:
    site, build_dir = Path(site_dir), Path(build)
    site.mkdir(exist_ok=True)
    if channel == "production":
        if not re.fullmatch(r"v\d+\.\d+\.\d+", version):
            sys.exit("Version must look like v1.2.3")
        target = site / "releases" / version
        if target.exists():
            sys.exit(f"{version} is already released; pick a new version number")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(build_dir, target)
        replace_root(site, build_dir)
    elif channel == "rollback":
        target = site / "releases" / version
        if not target.is_dir():
            sys.exit(f"No release {version}")
        replace_root(site, target)
    elif channel == "next":
        replace_dir(build_dir, site / "next")
    elif channel.startswith("dev/") or channel.startswith("remove-dev/"):
        name = channel.split("/", 1)[1].replace("/", "-").lower()
        if not re.fullmatch(r"[a-z0-9._-]+", name):
            sys.exit("Dev branch names may only use a-z, 0-9, '.', '_' and '-'")
        if channel.startswith("dev/"):
            (site / "dev").mkdir(exist_ok=True)
            replace_dir(build_dir, site / "dev" / name)
        else:
            shutil.rmtree(site / "dev" / name, ignore_errors=True)
    else:
        sys.exit(f"Unknown channel {channel}")

    (site / ".nojekyll").touch()
    vf = site / "versions.json"
    d = json.loads(vf.read_text()) if vf.exists() else {"production": None, "history": []}
    rel, dev = site / "releases", site / "dev"
    d["releases"] = sorted((p.name for p in rel.iterdir()), key=vkey) if rel.is_dir() else []
    d["dev"] = sorted(p.name for p in dev.iterdir()) if dev.is_dir() else []
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    if channel in ("production", "rollback"):
        d["production"] = version
        d["history"].append({"at": now, "action": channel, "version": version})
    d["updated"] = now
    vf.write_text(json.dumps(d, indent=2) + "\n")
    print(f"{channel} {version} done; production is {d['production']}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(*sys.argv[1:4])
