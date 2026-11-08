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
window.__MAPOWNIK_BOOTED__ = true;
const root = document.getElementById('root');
if (!root)
    throw new Error('Brak elementu #root w dokumencie.'); // dev: błąd programisty, nie komunikat dla użytkownika
ReactDOM.createRoot(root).render(_jsx(React.StrictMode, { children: _jsx(AppErrorBoundary, { children: _jsx(App, {}) }) }));
