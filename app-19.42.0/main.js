// 19.42.0: konfiguracja zod przed innymi modułami (CSP bez 'unsafe-eval') — patrz core/zodConfig.js.
import './core/zodConfig.js';
import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';
import { AppErrorBoundary } from './app/components/AppErrorBoundary.js';
import { installGlobalErrorHandlers } from './diagnostics/errorLog.js';
// 17.6.4: capture crashes as early as possible in the module's lifetime —
// before React ever renders — so nothing between here and the first paint
// can slip past the ring buffer.
installGlobalErrorHandlers();
// 19.42.0: po wgraniu nowej wersji otwarta karta może prosić o plik paczki (assets/build/…), którego już
// nie ma albo który się zmienił. Vite zgłasza to zdarzeniem vite:preloadError — wtedy jedno przeładowanie
// strony wczytuje aktualny index.html (bez pętli: znacznik w sessionStorage na 30 s).
window.addEventListener('vite:preloadError', (event) => {
    try {
        const last = Number(sessionStorage.getItem('msportal.reloadAfterDeploy') || 0);
        if (Date.now() - last < 30000) return;
        sessionStorage.setItem('msportal.reloadAfterDeploy', String(Date.now()));
    } catch { /* bez sessionStorage — przeładowanie i tak pomaga */ }
    event.preventDefault();
    window.location.reload();
});
window.__MAPOWNIK_BOOTED__ = true;
const root = document.getElementById('root');
if (!root)
    throw new Error('Brak elementu #root w dokumencie.'); // dev: błąd programisty, nie komunikat dla użytkownika
ReactDOM.createRoot(root).render(_jsx(React.StrictMode, { children: _jsx(AppErrorBoundary, { children: _jsx(App, {}) }) }));
