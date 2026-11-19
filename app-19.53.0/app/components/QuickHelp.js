import { createElement as h, useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { openOverlay, useAppDispatch } from '../../store/index.js';

const SEEN_KEY = 'msportal:quick-help-seen:v1';
const STEPS = Object.freeze([
    ['Znajdź miejsce', 'Wpisz adres, miejscowość albo numer działki w polu u góry.'],
    ['Kliknij działkę na mapie', 'Karta po lewej pokaże plan miejscowy, plan ogólny i formy ochrony.'],
    ['Raport i Analizy', 'Zakładki karty: granice działki, otoczenie i warstwy, które ją przecinają.'],
    ['Warstwy', 'Przycisk po prawej: plany, uzbrojenie, środowisko, geologia.'],
    ['Rysuj, Mierz, Eksport', 'Rysowanie i pomiary — na dole mapy. Eksport obrazu mapy — u góry.'],
]);

/**
 * 19.44.0: link „Polityka prywatności” tylko wtedy, gdy administrator opublikował plik
 * konfiguracja/polityka-prywatnosci.html (szkic: konfiguracja/polityka-prywatnosci.szkic.html). Sprawdzane raz, przy otwarciu pomocy.
 */
const PRIVACY_URL = './konfiguracja/polityka-prywatnosci.html';
let privacyCheck = null;
function privacyPolicyAvailable() {
    privacyCheck ??= fetch(PRIVACY_URL, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok && /html/.test(r.headers.get('content-type') || '')).catch(() => false);
    return privacyCheck;
}

function readSeen() { try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } }
function writeSeen() { try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* tryb prywatny */ } }

/**
 * 19.28.0 — „Jak zacząć” dla osób, które korzystają z portalu sporadycznie (audyt layoutu B9):
 * pięć kroków w małym okienku pod przyciskiem „?”. Otwiera się tylko przyciskiem „?”.
 */
export function QuickHelp() {
    const dispatch = useAppDispatch();
    const [open, setOpen] = useState(false);
    const [privacy, setPrivacy] = useState(false);
    useEffect(() => { if (open) void privacyPolicyAvailable().then(setPrivacy); }, [open]);
    const rootRef = useRef(null);
    // 19.33.0: pomoc nie otwiera się sama — tylko przyciskiem „?” (start ma być spokojny: mapa, wyszukiwarka, karta).
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') close(); };
        const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onPointer);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
    }, [open]);
    function close() { setOpen(false); writeSeen(); }

    return h('div', { className: 'quick-help', ref: rootRef },
        h(IconButton, { className: `topbar-primary-action${open ? ' is-active' : ''}`, label: 'Jak zacząć — pomoc', tooltipSide: 'bottom', 'aria-expanded': open, 'aria-controls': 'quick-help-card', onClick: () => (open ? close() : setOpen(true)) },
            h(HelpCircle, { size: 17 })),
        open && h('section', { id: 'quick-help-card', className: 'quick-help-card', role: 'dialog', 'aria-label': 'Jak zacząć' },
            h('div', { className: 'quick-help-head' },
                h('strong', null, 'Jak zacząć'),
                h(IconButton, { label: 'Zamknij pomoc', onClick: close }, h(X, { size: 15 }))),
            h('ol', { className: 'quick-help-steps' },
                STEPS.map(([title, text]) => h('li', { key: title }, h('strong', null, title), h('span', null, text)))),
            h('div', { className: 'quick-help-foot' },
                h('button', { type: 'button', className: 'quick-help-link', onClick: () => { close(); dispatch(openOverlay('shortcuts')); } }, 'Skróty klawiszowe'),
                privacy && h('a', { className: 'quick-help-link', href: PRIVACY_URL, target: '_blank', rel: 'noopener' }, 'Polityka prywatności'),
                h('button', { type: 'button', className: 'quick-help-ok', onClick: close }, 'Rozumiem'))));
}
