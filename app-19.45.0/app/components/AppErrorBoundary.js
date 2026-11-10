import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { recordError } from '../../diagnostics/errorLog.js';
import { t } from '../../i18n/index.js';

const VERSION = '19.45.0';
/**
 * Final UI safety net. A runtime exception should never leave a blank page.
 * The detailed error stays visible locally so startup problems can be diagnosed.
 */
export class AppErrorBoundary extends React.Component {
    constructor() {
        super(...arguments);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[msportal] Unhandled React error', error, info);
        // React swallows render-phase errors into this boundary — they never
        // reach window.onerror/unhandledrejection, so without this the crash
        // ring buffer would miss the single most user-visible failure mode.
        recordError({
            type: 'react',
            message: error?.message ?? String(error),
            stack: (error?.stack ?? '') + (info?.componentStack ? `\n${info.componentStack}` : ''),
            source: 'AppErrorBoundary',
        });
    }
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsx("main", { className: "fatal-error-screen", role: "alert", children: _jsxs("section", { className: "fatal-error-card", children: [_jsx("strong", { children: t('fatal.title') }), _jsx("p", { children: t('fatal.message') }), _jsx("pre", { children: this.state.error.message || String(this.state.error) }), _jsx("div", { className: "fatal-error-actions", children: _jsx("button", { type: "button", onClick: () => window.location.reload(), children: t('fatal.reload') }) }), _jsx("small", { children: t('fatal.version', { version: VERSION }) })] }) }));
    }
}
