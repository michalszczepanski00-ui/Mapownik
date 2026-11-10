import { useSketchActive } from '../hooks/useSketchActive.js';
import { createElement as h, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers3, MousePointer2, Pin, Search, X } from 'lucide-react';
import { ContextBar } from './ContextBar.js';
import { IconButton } from './IconButton.js';
import { getPanel, PanelView } from '../panels/PanelRegistry.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { PANEL_DEFS, PANEL_MODE, closePanel, openPanel, selectPanelMode, selectPanelOpen, useAppDispatch, useAppSelector } from '../../store/index.js';
import { clampWorkCardWidth, readWorkCardPreferences, WORK_CARD_MIN_WIDTH, WORK_CARD_MAX_WIDTH, WORK_CARD_PREFS_KEY, WORK_CARD_PREFS_EVENT } from './workspaceLayout.js';

const IDS = Object.keys(PANEL_DEFS).filter((id) => PANEL_DEFS[id].placeCard).sort((a,b) => PANEL_DEFS[a].order-PANEL_DEFS[b].order);
const IDLE = Object.freeze({ active: false });
const NO_IDENTIFY = Object.freeze({ open: false });
const NO_TOOLS = Object.freeze({ items: [] });
function storage() { try { return window.localStorage; } catch { return null; } }

/** One stable left card. Collapsing it never changes the map/tool runtime. */
export function WorkspaceCard() {
    const dispatch = useAppDispatch();
    const controller = useService('mapController');
    const identifyManager = useService('identify');
    const identify = useServiceSnapshot('identify', NO_IDENTIFY);
    const sketch = { active: useSketchActive() };
    const tools = useServiceSnapshot('tools', NO_TOOLS);
    const openId = useAppSelector((state) => IDS.find((id) => selectPanelMode(state,id) === PANEL_MODE.floating && selectPanelOpen(state,id)) ?? null);
    // Remember visited tabs, keeping their component state when changing tools.
    const [visited, setVisited] = useState([]);
    const [prefs, setPrefs] = useState(() => readWorkCardPreferences(storage()));
    const [viewport, setViewport] = useState(() => window.innerWidth);
    const rootRef = useRef(null);
    const dragCleanup = useRef(null);
    const width = clampWorkCardWidth(prefs.width, viewport);
    const collapsed = prefs.collapsed;
    useEffect(() => { if (openId) setVisited((current) => current.includes(openId) ? current : [...current,openId]); }, [openId]);
    // 19.28.0: wąski ekran (tablet w pionie) — wynik w karcie chowa panel po prawej, żeby została mapa (audyt C4).
    const rightActive = useAppSelector((state) => state.panels.dock.right.activeId);
    useEffect(() => { if (openId && rightActive && window.innerWidth < 900) dispatch(closePanel(rightActive)); }, [openId]);
    useEffect(() => {
        const resize = () => setViewport(window.innerWidth);
        const reset = () => setPrefs(readWorkCardPreferences(storage()));
        window.addEventListener('resize', resize);
        window.addEventListener(WORK_CARD_PREFS_EVENT, reset);
        return () => { window.removeEventListener('resize', resize); window.removeEventListener(WORK_CARD_PREFS_EVENT, reset); dragCleanup.current?.(); };
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(() => { try { storage()?.setItem(WORK_CARD_PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }, 180);
        return () => window.clearTimeout(timer);
    }, [prefs]);
    useEffect(() => {
        const area = rootRef.current?.closest('.map-area');
        const inset = collapsed ? 52 : width + 12;
        area?.style.setProperty('--work-card-inset-left', `${inset}px`);
        controller?.setOcclusion?.({ left: inset });
        return () => { area?.style.removeProperty('--work-card-inset-left'); controller?.setOcclusion?.({ left: 0 }); };
    }, [collapsed, width, controller]);
    const toggle = () => setPrefs((current) => ({ ...current, collapsed: !current.collapsed }));
    const changeWidth = (value) => setPrefs((current) => ({ ...current, width: clampWorkCardWidth(value, window.innerWidth) }));
    const resizeStart = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        dragCleanup.current?.();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const startX=event.clientX, initial=width;
        let frame=null, pending=initial;
        const commit=()=>{frame=null;changeWidth(pending);};
        const move=(next)=>{pending=initial+next.clientX-startX;if(frame===null)frame=window.requestAnimationFrame(commit);};
        const stop=(commit=true)=>{if(frame!==null)window.cancelAnimationFrame(frame);if(commit!==false)changeWidth(pending);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);dragCleanup.current=null;};
        dragCleanup.current=()=>stop(false);
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});window.addEventListener('pointercancel',stop,{once:true});
    };
    const pick = (id) => { dispatch(openPanel(id)); };
    const close = () => { if (PANEL_DEFS[openId]?.controlledBy==='identify') identifyManager?.close(); else if(openId) dispatch(closePanel(openId)); };
    const tabKeys=(event,id)=>{
        const index=IDS.indexOf(id);
        const next=event.key==='Home'?0:event.key==='End'?IDS.length-1:event.key==='ArrowRight'?(index+1)%IDS.length:event.key==='ArrowLeft'?(index-1+IDS.length)%IDS.length:-1;
        if(next<0)return;event.preventDefault();pick(IDS[next]);document.getElementById(`place-tab-${IDS[next]}`)?.focus();
    };
    const tabs = h('div',{className:'workspace-place-tabs',role:'tablist','aria-label':'Karta miejsca'},IDS.map((id)=>h('button',{
        key:id,id:`place-tab-${id}`,type:'button',role:'tab','aria-selected':openId===id,'aria-controls':`place-panel-${id}`,tabIndex:openId===id||(!openId&&id===IDS[0])?0:-1,
        className:`workspace-place-tab${openId===id?' is-active':''}`,onClick:()=>pick(id),onKeyDown:(event)=>tabKeys(event,id),
    },PANEL_DEFS[id].placeCardLabel??PANEL_DEFS[id].title)));
    const hasTask = tools.items.some((tool) => tool.active && !['core.pan', 'core.identify'].includes(tool.id));
    // 19.28.0: opis narzędzia tylko przy zadaniu (rysowanie, pomiar) — w spoczynku zastępuje go krótki „Jak zacząć”.
    const showContext = sketch.active || hasTask;
    const focusSearch = () => { const input = document.getElementById('map-search-input'); input?.focus(); input?.select?.(); };
    const start = h('div', { className: 'workspace-start' },
        h('p', { className: 'workspace-start-title' }, 'Wybierz działkę, aby zobaczyć plan, ochronę i raport:'),
        h('button', { type: 'button', className: 'workspace-start-item', onClick: focusSearch }, h(Search, { size: 15, 'aria-hidden': true }), h('span', null, 'Wpisz adres lub numer działki')),
        h('div', { className: 'workspace-start-item is-static' }, h(MousePointer2, { size: 15, 'aria-hidden': true }), h('span', null, 'albo kliknij działkę na mapie')),
        h('button', { type: 'button', className: 'workspace-start-item', onClick: () => dispatch(openPanel('layers')) }, h(Layers3, { size: 15, 'aria-hidden': true }), h('span', null, 'Warstwy: plany, uzbrojenie, środowisko')));
    return h('aside',{ref:rootRef,className:`workspace-card${collapsed?' is-collapsed':''}${sketch.active?' is-sketching':''}`,style:{'--work-card-width':`${width}px`},'aria-label':'Działka i narzędzia'},
        h('div',{className:'workspace-card-head'},
            // 19.24.0: właściwości obiektu są w pasku stylu nad dokiem narzędzi i w oknie „Zaawansowane”.
            !collapsed&&h('strong',null,'Działka i narzędzia'),
            h(IconButton,{label:collapsed?'Rozwiń kartę działki i narzędzi':'Zwiń kartę działki i narzędzi',className:'workspace-card-toggle','aria-expanded':!collapsed,'aria-controls':'workspace-card-body',onClick:toggle},h(collapsed?ChevronRight:ChevronLeft,{size:17})),
            !collapsed&&openId&&PANEL_DEFS[openId].controlledBy==='identify'&&h(IconButton,{label:identify.pinned?'Odepnij wynik':'Przypnij wynik','aria-pressed':Boolean(identify.pinned),onClick:()=>identifyManager?.togglePinned()},h(Pin,{size:14})),
            !collapsed&&openId&&h(IconButton,{label:'Zamknij wynik miejsca',onClick:close},h(X,{size:15}))),
        h('div',{id:'workspace-card-body',className:'workspace-card-body',hidden:collapsed},
            h('div',{className:'workspace-context',hidden:!showContext},h(ContextBar,{presentation:'card'})),
            // ContextBar alone during an active sketch. Keep other tabs mounted.
            h('div',{className:'workspace-place',hidden:sketch.active},tabs,
                !openId&&!hasTask&&start,
                [...new Set([...visited,...(openId?[openId]:[])])].map((id)=>{
                    const entry=getPanel(id);
                    return entry?h('div',{key:id,id:`place-panel-${id}`,role:'tabpanel','aria-labelledby':`place-tab-${id}`,hidden:openId!==id,className:'workspace-place-content'},h(PanelView,{entry})):null;
                }))),
        !collapsed&&h('div',{className:'workspace-card-resizer',role:'separator',tabIndex:0,'aria-orientation':'vertical','aria-label':'Szerokość karty działki i narzędzi','aria-valuemin':WORK_CARD_MIN_WIDTH,'aria-valuemax':Math.min(WORK_CARD_MAX_WIDTH,clampWorkCardWidth(WORK_CARD_MAX_WIDTH,viewport)),'aria-valuenow':width,onPointerDown:resizeStart,onKeyDown:(event)=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();changeWidth(event.key==='Home'?WORK_CARD_MIN_WIDTH:event.key==='End'?WORK_CARD_MAX_WIDTH:width+(event.key==='ArrowRight'?20:-20));
        }}));
}
