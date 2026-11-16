import { createElement as h } from 'react';
import { Button } from '../ui/index.js';
import { t } from '../../i18n/index.js';
export const PAGE_SIZE = 100;
export function pageRange(count, page, size = PAGE_SIZE) {
    const pages = Math.max(1, Math.ceil(count / size));
    const current = Math.min(pages - 1, Math.max(0, page));
    return { page: current, pages, start: current * size, end: (current + 1) * size };
}
export function Pagination({ count, page, onChange }) {
    const range = pageRange(count, page);
    if (range.pages === 1) return null;
    return h('div', { className: 'list-pagination', role: 'group', 'aria-label': t('paging.label', { page: range.page + 1, pages: range.pages, count }) },
        h(Button, { size: 'sm', disabled: range.page === 0, onClick: () => onChange(range.page - 1) }, t('paging.prev')),
        h('span', null, t('paging.label', { page: range.page + 1, pages: range.pages, count })),
        h(Button, { size: 'sm', disabled: range.page + 1 === range.pages, onClick: () => onChange(range.page + 1) }, t('paging.next')));
}
