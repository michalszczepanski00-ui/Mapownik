#!/usr/bin/env python3
"""msportal 19.56.0-b — Content-Security-Policy dla index.html (audyt B5).

Strona ma trzy skrypty wbudowane (wersja, importmap, start aplikacji). CSP dopuszcza je po sumie
sha256 treści, więc KAŻDA zmiana takiego skryptu (także numer wersji z tools/bump_version.py)
wymaga przeliczenia sum. Bez tego przeglądarka zablokuje start aplikacji (biały ekran).

Użycie (z katalogu głównego paczki):
    python3 tools/csp_hashes.py           # przelicza i zapisuje politykę w index.html
    python3 tools/csp_hashes.py --check   # tylko sprawdza (kod 1, gdy sumy są nieaktualne)
"""
from __future__ import annotations

import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)
META_RE = re.compile(r'(<meta http-equiv="Content-Security-Policy" content=")[^"]*(" />)')

# Źródła spoza serwera: kafle i usługi map (wiele urzędów, gmin i powiatów) — tylko HTTPS.
# Skrypty wyłącznie z tego serwera: to jest główna ochrona przed wstrzyknięciem kodu.
POLICY = [
    "default-src 'self'",
    "script-src 'self'{hashes}",
    "style-src 'self' 'unsafe-inline' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data:",
    "worker-src 'self' blob: data:",
    "child-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
]


def inline_hashes(html: str) -> list[str]:
    out = []
    for body in SCRIPT_RE.findall(html):
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
        out.append(f"'sha256-{digest}'")
    return out


def policy_for(html: str) -> str:
    hashes = "".join(" " + h for h in inline_hashes(html))
    return "; ".join(part.format(hashes=hashes) for part in POLICY)


def main() -> int:
    # Plik może mieć końce linii CRLF; parser HTML przeglądarki zamienia je na LF, zanim policzy sumę
    # skryptu — liczymy więc na treści z LF, a zapisujemy z zachowaniem oryginalnych końców linii.
    raw = INDEX.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw
    html = raw.replace("\r\n", "\n").replace("\r", "\n")
    match = META_RE.search(html)
    if not match:
        print("index.html: brak <meta http-equiv=\"Content-Security-Policy\" …>", file=sys.stderr)
        return 1
    wanted = policy_for(html)
    current = re.search(r'content="([^"]*)"', match.group(0)).group(1)
    if "--check" in sys.argv:
        if current != wanted:
            print("index.html: sumy CSP skryptów wbudowanych są nieaktualne — uruchom python3 tools/csp_hashes.py", file=sys.stderr)
            return 1
        print("index.html: CSP aktualne")
        return 0
    if current != wanted:
        updated = META_RE.sub(lambda m: m.group(1) + wanted + m.group(2), html, count=1)
        INDEX.write_bytes((updated.replace("\n", "\r\n") if crlf else updated).encode("utf-8"))
        print("index.html: zapisano CSP")
    else:
        print("index.html: CSP bez zmian")
    return 0


if __name__ == "__main__":
    sys.exit(main())
