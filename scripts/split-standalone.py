#!/usr/bin/env python3
"""Split the 3.0 standalone HTML into a multi-file prototype."""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/Users/zengdada/Downloads/观星台3.0.html")
ASSETS = ROOT / "assets"
VENDOR = ASSETS / "vendor"

SIZE_NAMES = {
    (2732, "png"): "momentx-observatory-favicon-32.png",
    (1752416, "png"): "home-hero.png",
    (587092, "jpeg"): "momentx-observatory-logo.jpg",
    (309496, "png"): "momentx-observatory-icon.png",
}

NAV_ORDER = [
    "nav-dashboard-default.png",
    "nav-dashboard-active.png",
    "nav-service-default.png",
    "nav-service-active.png",
    "nav-asset-default.png",
    "nav-asset-active.png",
    "nav-permission-default.png",
    "nav-permission-active.png",
]


def unescape_inline(source: str, kind: str) -> str:
    if kind == "style":
        return re.sub(r"<\\/style", "</style", source, flags=re.I)
    return re.sub(r"<\\/script", "</script", source, flags=re.I)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def decode_data_url(url: str) -> tuple[str, bytes]:
    compact = url.replace("\n", "")
    header, payload = compact.split(",", 1)
    mime = header.split(":")[1].split(";")[0].lower()
    if "base64" in header:
        padding = "=" * ((4 - len(payload) % 4) % 4)
        data = base64.b64decode(payload + padding)
    else:
        data = unquote(payload).encode("utf-8")
    subtype = mime.split("/", 1)[1]
    return subtype, data


def collect_data_urls(text: str) -> dict[str, str]:
    """Map unique data-URL string -> assets/filename."""
    mapping: dict[str, str] = {}
    nav_assigned = 0
    pattern = re.compile(
        r"data:image/(png|jpeg|jpg|svg\+xml|x-icon)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\n]+)",
        re.I,
    )
    for match in pattern.finditer(text):
        url = match.group(0).replace("\n", "")
        if url in mapping:
            continue
        b64_len = len(match.group(2).replace("\n", ""))
        subtype = match.group(1).lower()
        if subtype == "jpg":
            subtype = "jpeg"
        if b64_len < 200:
            continue
        name = SIZE_NAMES.get((b64_len, subtype))
        if not name and subtype == "png" and 800 <= b64_len <= 1600 and nav_assigned < len(NAV_ORDER):
            name = NAV_ORDER[nav_assigned]
            nav_assigned += 1
        if not name:
            digest = hashlib.md5(url.encode()).hexdigest()[:8]
            name = f"embedded-{digest}.{'jpg' if subtype == 'jpeg' else 'png'}"
        mapping[url] = f"assets/{name}"
        path = ASSETS / name
        if not path.exists():
            _, data = decode_data_url(url)
            path.write_bytes(data)
            print(f"wrote assets/{name} ({len(data)} bytes)")
    return mapping


def replace_data_urls(text: str, mapping: dict[str, str]) -> str:
    for url, rel in mapping.items():
        text = text.replace(url, rel)
        # original HTML may wrap long base64
        wrapped = url
        if wrapped in text:
            text = text.replace(wrapped, rel)
    text = re.sub(
        r"data:image/svg\+xml;utf8,([^\"'\s]+)",
        lambda m: replace_svg(m),
        text,
    )
    return text


def replace_svg(match: re.Match[str]) -> str:
    payload = unquote(match.group(1))
    name = "nav-push-active.svg" if "%230066FF" in match.group(1) or "#0066FF" in payload else "nav-push-default.svg"
    path = ASSETS / name
    if not path.exists():
        path.write_text(payload, encoding="utf-8")
        print(f"wrote assets/{name} ({path.stat().st_size} bytes)")
    return f"assets/{name}"


def split() -> None:
    html = SOURCE.read_text(encoding="utf-8")
    ASSETS.mkdir(parents=True, exist_ok=True)
    VENDOR.mkdir(parents=True, exist_ok=True)

    style_map = {
        "assets/vendor/element-plus.css": VENDOR / "element-plus.css",
        "assets/cp-vue-module.css": ASSETS / "cp-vue-module.css",
        "assets/portal-vue-module.css": ASSETS / "portal-vue-module.css",
    }
    script_map = {
        "assets/vendor/vue.global.prod.js": VENDOR / "vue.global.prod.js",
        "assets/vendor/element-plus.full.min.js": VENDOR / "element-plus.full.min.js",
        "assets/vendor/element-plus.zh-cn.min.js": VENDOR / "element-plus.zh-cn.min.js",
        "assets/cp-vue-module.js": ASSETS / "cp-vue-module.js",
        "assets/portal-vue-module.js": ASSETS / "portal-vue-module.js",
    }

    unnamed_styles: list[str] = []
    unnamed_scripts: list[str] = []

    def take_style(match: re.Match[str]) -> str:
        attrs, body = match.group(1), match.group(2)
        source = re.search(r'data-inline-source="([^"]+)"', attrs)
        text = unescape_inline(body, "style")
        if source:
            write_text(style_map[source.group(1)], text)
            return f'<link rel="stylesheet" href="{source.group(1)}" />'
        unnamed_styles.append(text)
        return '<link rel="stylesheet" href="assets/portal-shell.css" />'

    def take_script(match: re.Match[str]) -> str:
        attrs, body = match.group(1), match.group(2)
        if re.search(r"\bsrc=", attrs):
            return match.group(0)
        source = re.search(r'data-inline-source="([^"]+)"', attrs)
        text = unescape_inline(body, "script")
        if source:
            write_text(script_map[source.group(1)], text)
            return f'<script src="{source.group(1)}"></script>'
        unnamed_scripts.append(text)
        return "<!--SCRIPT_PLACEHOLDER-->"

    html = re.sub(r"<style([^>]*)>(.*?)</style>", take_style, html, flags=re.S)
    html = re.sub(r"<script([^>]*)>(.*?)</script>", take_script, html, flags=re.S)

    if len(unnamed_styles) != 1:
        raise SystemExit(f"expected 1 unnamed style, got {len(unnamed_styles)}")
    if len(unnamed_scripts) != 2:
        raise SystemExit(f"expected 2 unnamed scripts, got {len(unnamed_scripts)}")

    write_text(ASSETS / "portal-shell.css", unnamed_styles[0])
    write_text(ASSETS / "portal-bridge.js", unnamed_scripts[0])
    write_text(ASSETS / "cp-bridge.js", unnamed_scripts[1])

    html = html.replace("<!--SCRIPT_PLACEHOLDER-->", '<script src="assets/portal-bridge.js"></script>', 1)
    html = html.replace("<!--SCRIPT_PLACEHOLDER-->", '<script src="assets/cp-bridge.js"></script>', 1)

    blob = "\n".join(
        [
            html,
            (ASSETS / "portal-bridge.js").read_text(encoding="utf-8"),
            (ASSETS / "cp-bridge.js").read_text(encoding="utf-8"),
            (ASSETS / "portal-vue-module.js").read_text(encoding="utf-8"),
            (ASSETS / "cp-vue-module.js").read_text(encoding="utf-8"),
        ]
    )
    mapping = collect_data_urls(blob)
    print(f"image mapping: {len(mapping)} unique data URLs")

    for path in [
        ROOT / "index.html",
        ASSETS / "portal-bridge.js",
        ASSETS / "cp-bridge.js",
        ASSETS / "portal-vue-module.js",
        ASSETS / "cp-vue-module.js",
        ASSETS / "portal-shell.css",
        ASSETS / "cp-vue-module.css",
        ASSETS / "portal-vue-module.css",
    ]:
        if path == ROOT / "index.html":
            text = html
        else:
            text = path.read_text(encoding="utf-8")
        updated = replace_data_urls(text, mapping)
        if path == ROOT / "index.html":
            updated = re.sub(r"\n{3,}", "\n\n", updated).strip() + "\n"
            # tidy head: keep doctype/html/head structure
            write_text(path, updated)
        elif updated != text:
            write_text(path, updated)

    leftover = []
    for path in ROOT.rglob("*"):
        if path.suffix.lower() not in {".html", ".js", ".css"}:
            continue
        if "vendor" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "data:image/" in text:
            leftover.append(str(path.relative_to(ROOT)))
    if leftover:
        print("WARNING leftover data URLs in", leftover)
    print("split complete")


if __name__ == "__main__":
    split()
