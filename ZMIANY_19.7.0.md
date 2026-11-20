# msportal 19.7.0 — 24.10.2026

Wydanie na bazie pełnych źródeł 19.5.0-r2. Nie stanowi eksportu nieudostępnionego pełnego 19.6.2.

- Naprawiono składnię panelu VPS i dostęp do niego na telefonie.
- Podzielono panel na zadania: ceny RCN, budynki/drogi i działka; uproszczono sekcje źródeł.
- Poprawiono unieważnianie odpowiedzi po zmianie zadania, nazwy pól i komunikaty braku danych.
- Naprawiono błędne unchanged przy braku skrótu; skróty wszystkich wycinków są liczone strumieniowo.
- Zintegrowano poprawkę HEAD/Range i ogranicznik powtarzających się błędów sieci. Ustawiono timeouty i politykę redirectów czytnika fsspec.
- Naprawiono JSON atrybutów warstw i zachowanie geometrii przy uszkodzonych starszych opisach.
- Dodano record_key do SQLite, semantykę identyfikatorów transakcji oraz pełne roczne liczniki z odrębną liczebnością próby.
- Dodano /ready, limitowanie kosztownych analiz, Retry-After i ograniczenie czasu odczytów SQLite.
- Rozszerzono stan administratora o problemy danych i wyniki zadań kontrolnych.
- Przeniesiono interaktywny menedżer źródeł do sesji administratora z Origin/CSRF, bez kopiowania tokenu.
- Poprawiono wyłączanie zbiorczej warstwy sieci oraz dodano mobilny komunikat awarii podkładu.
- Poprawiono testy HTTPS i przywracanie usług przed aktywacją wydania; zablokowano nadpisanie nieznanej linii wersji.
- Zablokowano alias API admina; wyłączono interpretowanie niezaufanych nagłówków proxy przez uvicorn.
- Rozszerzono backup o konfigurację i projekty, wymagane szyfrowanie rclone crypt i trwały wynik zadania.
- Dodano testy regresji i pakiet do przekazania innym narzędziom AI.

Stan każdego ustalenia i pozostałe ograniczenia opisano w docs/AUDIT_STATUS.md głównej paczki. Instalacja nie była wykonywana na produkcyjnym VPS.
