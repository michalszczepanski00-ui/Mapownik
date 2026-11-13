# świadectwa.net – strona firmowa

Statyczna strona (Astro 5), 10 stron + 404. Bez cookies, bez zewnętrznych skryptów i czcionek, bez serwera formularzy.

## Gdzie co edytować
- `src/data/site.ts` – dane firmy (NIP, adres, telefon), nawigacja, wspólne FAQ
- `src/pages/*.astro` – treść poszczególnych stron
- `src/data/polityka.html` – treść polityki prywatności (dokument prawny, do przeglądu prawnika)
- `src/data/credits.json` – autorzy zdjęć (strona `/zrodla-zdjec/`)
- `src/styles/global.css` – cały wygląd
- `public/img/` – zdjęcia (obecnie zamienniki z Wikimedia Commons)

## Polecenia
```bash
npm install
npm run dev        # podgląd lokalny
npm run build      # build do dist/ (+ twarde spacje po spójnikach)
```
Podgląd bez indeksowania: `PUBLIC_PREVIEW=1 npm run build`.

## Wdrożenie (Cloudflare Workers, pliki statyczne)
```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy
```
Konfiguracja w `wrangler.jsonc`. Domenę swiadectwa.net podpina się w Cloudflare (Workers → Settings → Domains).

## Formularz zapytania
Nie wysyła danych na serwer: buduje wiadomość e-mail w programie pocztowym użytkownika (`mailto:`),
zgodnie z polityką prywatności („kontakt przede wszystkim e-mailowo”). Wysyłka z poziomu strony wymagałaby
zmiany polityki prywatności.
