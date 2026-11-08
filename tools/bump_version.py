#!/usr/bin/env python3
"""Mapownik — podbicie numeru wersji (18.18.3).

Pliki w katalogu app-<wersja>/ są buforowane w przeglądarkach na stałe
(.htaccess: immutable), więc KAŻDA zmiana kodu wymaga nowej nazwy katalogu
i nowych parametrów ?v=… . Ręcznie oznaczało to zmianę ok. 20 plików;
pominięcie jednego dawało biały ekran albo stary kod w przeglądarce.

Użycie (z katalogu głównego paczki):
    python3 tools/bump_version.py 18.18.4            # zmienia pliki
    python3 tools/bump_version.py 18.18.4 --dry-run  # tylko pokazuje, co by zmienił
    python3 tools/bump_version.py --check            # sprawdza spójność bieżącej wersji

Co zmienia:
  - nazwę katalogu app-<stara>/ → app-<nowa>/,
  - odwołania funkcjonalne: app-<wersja>, ?v=<wersja>, '<wersja>' i "<wersja>",
    <wersja>-server / -export, Mapownik/<wersja>, tytuły diagnostyki i monitora,
    regułę w .htaccess, VERSION.txt, nagłówki README.
Czego NIE zmienia: komentarzy historycznych („// 18.18.0: …"), plików ZMIANY_*.md,
raportów w audyt/, katalogów vendor/ i cache/, plików binarnych.

Po zmianie uruchamia kontrolę spójności (te same warunki co verify-deployment.php)
i kończy się kodem 1, jeśli coś się nie zgadza.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"audyt", "vendor", "cache", ".git", "node_modules", "data"}
TEXT_EXT = {".html", ".js", ".mjs", ".css", ".php", ".json", ".txt", ".md", ".py", ".htaccess", ".example", ".conf", ".sh", ".service", ""}
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def current_version() -> str:
    value = (ROOT / "VERSION.txt").read_text(encoding="utf-8").strip()
    if not VERSION_RE.match(value):
        sys.exit(f"VERSION.txt zawiera nieprawidłową wersję: {value!r}")
    return value


def patterns(old: str, new: str) -> list[tuple[re.Pattern[str], str]]:
    o = re.escape(old)
    o_htaccess = re.escape(old.replace(".", "\\."))  # w .htaccess: app-18\.18\.2
    n_htaccess = new.replace(".", "\\\\.")
    return [
        # .htaccess zawiera regułę dla bieżącego katalogu — podmieniamy KAŻDĄ regułę app-X.Y.Z
        # (19.3.1: poprzednio wydanie zostało z regułą 18.18.4 i białym ekranem na Apache).
        (re.compile(r"RewriteRule \^app-\d+\\\.\d+\\\.\d+/ - \[L\]"), "RewriteRule ^app-" + n_htaccess + "/ - [L]"),
        (re.compile(r"app-" + o_htaccess), "app-" + n_htaccess),
        (re.compile(r"app-" + o + r"(?![\d.])"), "app-" + new),
        (re.compile(r"\?v=" + o + r"(?![\d.])"), "?v=" + new),
        (re.compile(r"'" + o + r"'"), f"'{new}'"),
        (re.compile(r'"' + o + r'"'), f'"{new}"'),
        (re.compile(o + r"-(server|export)\b"), new + r"-\1"),
        (re.compile(r"((?:Mapownik|MSPortal)(?:Vendor)?/)" + o + r"(?![\d.])"), r"\g<1>" + new),
        (re.compile(r"(Diagnostyka Mapownika |Diagnostyka msportalu |MSPortal |msportal |Mapownik |MAPOWNIK |Wersja: )" + o + r"(?![\d.])"), r"\g<1>" + new),
        (re.compile(r"<strong>" + o + r"</strong>"), f"<strong>{new}</strong>"),
        (re.compile(r'(<p class="muted">)' + o + r"( sprawdza)"), r"\g<1>" + new + r"\g<2>"),
        (re.compile(r"(Aktualny \.htaccess dopuszcza app-)" + o), r"\g<1>" + new),
    ]


def iter_text_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = Path(dirpath).relative_to(ROOT)
        dirnames[:] = [d for d in dirnames if not (rel == Path(".") and d in SKIP_DIRS)]
        for name in filenames:
            path = Path(dirpath) / name
            if name.startswith("ZMIANY") or path.suffix.lower() not in TEXT_EXT:
                continue
            if name == "bump_version.py":
                continue
            yield path


def bump(old: str, new: str, dry_run: bool) -> int:
    old_app, new_app = ROOT / f"app-{old}", ROOT / f"app-{new}"
    if not old_app.is_dir():
        sys.exit(f"Brak katalogu {old_app.name}/")
    if new_app.exists():
        sys.exit(f"Katalog {new_app.name}/ już istnieje")
    rules = patterns(old, new)
    changed = 0
    for path in iter_text_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        updated = text
        for rx, repl in rules:
            updated = rx.sub(repl, updated)
        if path.name == "VERSION.txt":
            updated = re.sub(r"^" + re.escape(old) + r"\s*$", new + "\n", updated, flags=re.M)
        if updated != text:
            changed += 1
            hits = sum(len(rx.findall(text)) for rx, _ in rules)
            print(f"  {path.relative_to(ROOT)}  ({hits} odwołań)")
            if not dry_run:
                path.write_text(updated, encoding="utf-8")
    print(f"{'Do zmiany' if dry_run else 'Zmieniono'}: {changed} plików")
    if not dry_run:
        old_app.rename(new_app)
        print(f"Katalog: {old_app.name}/ → {new_app.name}/")
    return changed


def check(expected: str) -> list[str]:
    """Te same warunki co verify-deployment.php oraz brak odwołań do innych wersji."""
    problems: list[str] = []
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"app-(\d+\.\d+\.\d+)/main\.js", index)
    if not m or m.group(1) != expected:
        problems.append(f"index.html wskazuje app-{m.group(1) if m else '?'}/main.js, oczekiwano {expected}")
    m = re.search(r"__MAPOWNIK_DEPLOY_VERSION__\s*=\s*'([^']+)'", index)
    if not m or m.group(1) != expected:
        problems.append("index.html: __MAPOWNIK_DEPLOY_VERSION__ nie zgadza się z VERSION.txt")
    dirs = sorted(p.name for p in ROOT.glob("app-*") if p.is_dir())
    if dirs != [f"app-{expected}"]:
        problems.append(f"katalogi aplikacji: {dirs} (oczekiwano tylko app-{expected})")
    ht = (ROOT / ".htaccess").read_text(encoding="utf-8")
    if f"RewriteRule ^app-{expected.replace('.', chr(92) + '.')}/ - [L]" not in ht:
        problems.append(".htaccess nie dopuszcza bieżącego katalogu aplikacji")
    health = (ROOT / "api" / "health.php").read_text(encoding="utf-8")
    if f"'{expected}-server'" not in health:
        problems.append("api/health.php ma inną wersję")
    diag = (ROOT / "diagnostyka.html").read_text(encoding="utf-8")
    if f"CURRENT_DIAG_VERSION='{expected}'" not in diag:
        problems.append("diagnostyka.html ma inną wersję")
    # Każdy modulepreload i import z index.html musi istnieć.
    for ref in re.findall(r'href="\.?/?(app-[^"?]+)', index):
        if not (ROOT / ref).is_file():
            problems.append(f"index.html: brak pliku {ref}")
    # Odwołania funkcjonalne do innej wersji (app-X.Y.Z albo ?v=X.Y.Z).
    # ?v= tylko przy plikach Mapownika (biblioteki w vendor/ mają własne numery).
    stale = re.compile(r"app-(\d+\.\d+\.\d+)/|(?:assets|monitor|api|app-\d+\.\d+\.\d+)/[^\"'\s?`]*\?v=(\d+\.\d+\.\d+)(?![\d.])")
    for path in iter_text_files():
        if path.suffix == ".md" or path.name.startswith("README"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for mm in stale.finditer(text):
            ver = mm.group(1) or mm.group(2)
            line = text.count("\n", 0, mm.start()) + 1
            line_text = text.splitlines()[line - 1].lstrip() if text else ""
            # Pozostałość po podbiciu to wersja z tej samej serii (np. 18.18.x); starsze
            # numery w testach diagnostyki (lista zablokowanych katalogów) są celowe.
            same_series = ver.split(".")[:2] == expected.split(".")[:2]
            if ver != expected and same_series and not line_text.startswith(("//", "/*", "*", "#", "<!--")):
                problems.append(f"{path.relative_to(ROOT)}:{line}: odwołanie do wersji {ver}")
                break
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Podbicie wersji Mapownika")
    parser.add_argument("version", nargs="?", help="nowa wersja, np. 18.18.4")
    parser.add_argument("--dry-run", action="store_true", help="tylko pokaż zmiany")
    parser.add_argument("--check", action="store_true", help="tylko sprawdź spójność bieżącej wersji")
    args = parser.parse_args()
    old = current_version()
    if args.check or not args.version:
        problems = check(old)
        for p in problems:
            print("BŁĄD:", p)
        print(f"Wersja {old}: {'spójna' if not problems else str(len(problems)) + ' problemów'}")
        return 1 if problems else 0
    new = args.version.strip()
    if not VERSION_RE.match(new):
        sys.exit("Wersja musi mieć postać X.Y.Z")
    if tuple(map(int, new.split("."))) <= tuple(map(int, old.split("."))):
        sys.exit(f"Nowa wersja {new} musi być wyższa niż bieżąca {old}")
    print(f"Mapownik {old} → {new}{' (próba)' if args.dry_run else ''}")
    bump(old, new, args.dry_run)
    if args.dry_run:
        return 0
    problems = check(new)
    for p in problems:
        print("BŁĄD:", p)
    if problems:
        print("Wersja NIE jest spójna — popraw powyższe miejsca przed wdrożeniem.")
        return 1
    print(f"Wersja {new} spójna. Uzupełnij ZMIANY_{new}.md i sprawdź verify-deployment.php po wgraniu.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
