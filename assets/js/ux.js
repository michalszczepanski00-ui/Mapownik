/*
 * Mapownik — dodatek interfejsu (propozycja do 19.50.0). Zwykły skrypt (nie moduł), ładowany po boot.js.
 *
 * Robi pięć rzeczy i nic więcej (4: ukrywa archiwum MIDAS, 5: pozycja „Zadania” w prawej belce) (3: przycisk „Więcej" ukrywający akcje drugorzędne karty działki); gdy któregoś elementu strony nie ma, po prostu go pomija:
 *  1. Wartości domyślne szerokości paneli — tylko gdy użytkownik nie ustawił własnych
 *     (karta działki 320 px, panele po prawej 300 px). Zapis w localStorage czyta aplikacja przy starcie.
 *  2. Przycisk „Eksport" w szynie paneli (pod separatorem), zamiast osobnego przycisku w górnym pasku.
 *     Przycisk w szynie tylko przekazuje kliknięcie do istniejącego przycisku „Eksport" (jest ukryty stylem,
 *     nie usunięty), więc logika aplikacji nie jest ruszana. Jeśli przycisku w szynie nie uda się dodać,
 *     górny „Eksport" zostaje widoczny (klasa ux-export-rail ustawiana dopiero po sukcesie).
 */
(function () {
  'use strict';

  // 1. Domyślne szerokości --------------------------------------------------------------------------
  try {
    var ls = window.localStorage;
    if (ls && !ls.getItem('msportal:work-card:v1')) {
      ls.setItem('msportal:work-card:v1', JSON.stringify({ width: 320, collapsed: false }));
    }
    if (ls && !ls.getItem('mapownik:workspace-v18')) {
      ls.setItem('mapownik:workspace-v18', JSON.stringify({
        objectsWidth: 318, objectsHeight: null, objectsPosition: null,
        layersWidth: 292, layersHeight: null, layersPosition: null,
        dockRightActiveId: null, dockRightWidth: 300, dockRightSplitId: null, dockRightSplitRatio: 0.58,
        dockBottomHeight: 280, floatingPanels: ['identify', 'vpsData', 'analysis']
      }));
    }
  } catch (e) { /* tryb prywatny / zablokowany zapis: obowiązują wartości domyślne aplikacji */ }

  // 2. Eksport w szynie paneli ----------------------------------------------------------------------
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var scheduled = false;

  function exportIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3');
    svg.appendChild(p);
    return svg;
  }

  function exportPanelOpen() {
    var titles = document.querySelectorAll('.dock .panel-title strong');
    for (var i = 0; i < titles.length; i++) {
      if (/^Eksport mapy/.test(titles[i].textContent || '')) return true;
    }
    return false;
  }

  function sync() {
    scheduled = false;
    var bar = document.querySelector('.activity-bar');
    var trigger = document.querySelector('.export-map-trigger');
    syncMore();
    syncTasks();
    syncTools();
    syncMobileTasks();
    hideRemoved();
    if (!bar || !trigger) return;
    var slot = bar.querySelector('.ux-export-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'activity-bar-slot ux-export-slot';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-button activity-bar-button has-label ux-export-button';
      btn.setAttribute('aria-label', 'Eksport mapy');
      btn.title = 'Eksport mapy: raport PDF, obraz PNG';
      btn.appendChild(exportIcon());
      var label = document.createElement('span');
      label.className = 'activity-bar-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = 'Eksport';
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        var t = document.querySelector('.export-map-trigger');
        if (t) t.click();
      });
      slot.appendChild(btn);
      bar.appendChild(slot);
      document.documentElement.classList.add('ux-export-rail');
    }
    var open = exportPanelOpen();
    var b = slot.firstChild;
    if (b && b.classList.contains('is-active') !== open) {
      b.classList.toggle('is-active', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  // 3. „Więcej" w akcjach karty działki ---------------------------------------------------------------
  var moreOpen = false;
  function syncMore() {
    var more = document.querySelector('.workspace-card .identify-actions-more');
    if (!more) return;
    var prev = more.previousElementSibling;
    if (prev && prev.classList.contains('ux-more-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ux-more-toggle';
    var paint = function () {
      btn.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
      btn.textContent = moreOpen ? 'Mniej ▴' : 'Więcej ▾';
    };
    paint();
    btn.addEventListener('click', function () { moreOpen = !moreOpen; paint(); });
    more.parentNode.insertBefore(btn, more);
  }

  // 4. Archiwum MIDAS i ukryte warstwy: zniknęły z oferty (decyzja: usunięte) ------------------------------
  function hideRemoved() {
    var groups = document.querySelectorAll('.layers-list .layer-group');
    for (var i = 0; i < groups.length; i++) {
      var t = groups[i].querySelector('.layer-group-toggle span');
      if (t && /^Archiwum/.test((t.textContent || '').trim())) groups[i].style.display = 'none';
    }
    var items = document.querySelectorAll('[role^="menuitem"]');
    for (var j = 0; j < items.length; j++) {
      if (/warstwy archiwalne/i.test(items[j].textContent || '')) items[j].style.display = 'none';
    }
  }

  // 5. „Zadania" — osobna pozycja prawej belki --------------------------------------------------------------
  // Zadanie = zestaw warstw (albo otwarcie panelu) pod jeden cel. Warstwy włącza się tak, jak zrobiłby to
  // użytkownik: przez wiersze panelu Warstwy (panel jest w tym czasie niewidoczny). Nie ruszamy kodu aplikacji.
  var TASKS = [
    { id: 'plan', title: 'Plan zagospodarowania', hint: 'Plan miejscowy i plan ogólny na mapie',
      layers: ['MPZP — obszary planów', 'POG — obszary planów ogólnych'] },
    { id: 'dzialki', title: 'Działki i grunty', hint: 'Granice działek i klasy gruntów (od ok. 1:2600)',
      layers: ['Działki ewidencyjne (KIEG)', 'Klasy bonitacyjne I–VI i użytki (EGiB)'] },
    { id: 'ryzyka', title: 'Ryzyka: powódź i ochrona przyrody', hint: 'Zagrożenie powodziowe, Natura 2000, obszary chronionego krajobrazu',
      layers: ['Powódź rzeczna — obszary zagrożenia', 'Powódź morska — obszary zagrożenia', 'Zagrożenie przy awarii budowli piętrzących',
               'Natura 2000 — siedliskowa', 'Natura 2000 — ptasia', 'Obszary chronionego krajobrazu'] },
    { id: 'uzbrojenie', title: 'Uzbrojenie terenu', hint: 'Sieci: prąd, gaz, woda, kanalizacja, telekom., ciepło (od ok. 1:2600)',
      layers: ['Energia elektryczna', 'Gaz', 'Wodociąg', 'Kanalizacja', 'Telekomunikacja', 'Sieć ciepłownicza'] },
    { id: 'energetyka', title: 'Energetyka i OZE', hint: 'Biogazownie (KOWR), linie i stacje najwyższych napięć (PSE)',
      layers: ['Biogazownie rolnicze (KOWR)', 'Linie i stacje najwyższych napięć (PSE)'] },
    { id: 'ceny', title: 'Ceny w okolicy', hint: 'Otwiera panel Ceny transakcyjne', panel: 'marketPrices' },
    { id: 'budowy', title: 'Budowy i pozwolenia', hint: 'Otwiera panel Budowy i pozwolenia', panel: 'buildingPermits' }
  ];

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function until(test, ms) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        var v = test();
        if (v || Date.now() - t0 > ms) return resolve(v);
        setTimeout(tick, 80);
      })();
    });
  }
  function railButton(id) { return document.querySelector('.activity-bar [data-panel-id="' + id + '"]'); }
  function layerRows() { return document.querySelectorAll('.layers-list .layer-row'); }
  function rowTitle(r) { var s = r.querySelector('strong'); return s ? (s.textContent || '').trim() : ''; }
  function findRow(title) {
    var rows = layerRows();
    for (var i = 0; i < rows.length; i++) if (rowTitle(rows[i]) === title) return rows[i];
    return null;
  }
  function rowOn(row) {
    var b = row.querySelector('.layer-visibility');
    return !!b && (b.classList.contains('is-visible') || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true');
  }

  var busy = false;
  // Zwraca { found: [...], missing: [...] } po włączeniu (on = true) albo wyłączeniu zestawu warstw.
  async function setLayers(titles, on) {
    var mobile = !!document.querySelector('.app-shell.is-mobile');
    var layersBtn = mobile ? document.querySelector('.m-list-button') : railButton('layers');
    var wasOpen = !!document.querySelector('.layers-panel');
    if (!layersBtn && !wasOpen) return { found: [], missing: titles.slice() };
    var root = document.documentElement;
    root.classList.add('ux-silent');
    try {
      if (!wasOpen) layersBtn.click();
      await until(function () { return layerRows().length > 0; }, 4000);
      // filtr „Wszystkie", żeby wiersze były na liście
      var filters = document.querySelectorAll('.layers-panel .layers-filter');
      if (filters.length && !filters[0].classList.contains('is-active')) { filters[0].click(); await wait(150); }
      // rozwiń grupy, w których szukamy
      for (var g = 0; g < 10; g++) {
        var closed = document.querySelectorAll('.layers-list .layer-group.is-collapsed .layer-group-toggle');
        if (!closed.length) break;
        closed[0].click(); await wait(120);
      }
      var found = [], missing = [];
      for (var i = 0; i < titles.length; i++) {
        var row = findRow(titles[i]);
        if (!row) { missing.push(titles[i]); continue; }
        found.push(titles[i]);
        if (rowOn(row) !== on) { var b = row.querySelector('.layer-visibility'); if (b) { b.click(); await wait(120); } }
      }
      return { found: found, missing: missing };
    } finally {
      if (!wasOpen) {
        var x = document.querySelector('.layers-panel [aria-label="Zamknij panel Warstwy"]');
        if (x) x.click();
        else { var again = railButton('layers'); if (again && document.querySelector('.layers-panel')) again.click(); }
      }
      await wait(120);
      root.classList.remove('ux-silent');
    }
  }

  function tasksState(task) {
    if (!task.layers) return null;
    if (!document.querySelector('.layers-list')) return null; // stan znany tylko przy otwartym panelu Warstwy
    var n = 0, total = 0;
    for (var i = 0; i < task.layers.length; i++) { var r = findRow(task.layers[i]); if (r) { total++; if (rowOn(r)) n++; } }
    return { n: n, total: total };
  }

  var tasksState_ = {}; // id -> true, gdy zestaw włączono z tego panelu
  function closeTasks() {
    var p = document.querySelector('.ux-tasks');
    if (p) p.remove();
    var bs = document.querySelectorAll('.ux-rail-extra');
    for (var i = 0; i < bs.length; i++) { bs[i].classList.remove('is-active'); bs[i].setAttribute('aria-expanded', 'false'); }
  }

  function buildTasks() {
    var shell = document.querySelector('.app-shell');
    var rail = document.querySelector('.activity-bar');
    if (!shell || !rail) return;
    closeTasks();
    // zwolnij miejsce: zamknij otwarty panel po prawej (ten sam obszar)
    var openBtn = document.querySelector('.activity-bar .activity-bar-button.is-active[data-panel-id]');
    if (openBtn) openBtn.click();
    var panel = document.createElement('section');
    panel.className = 'ux-tasks';
    panel.setAttribute('aria-label', 'Zadania');
    var head = document.createElement('div'); head.className = 'ux-tasks-head';
    var h = document.createElement('strong'); h.textContent = 'Zadania'; head.appendChild(h);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'ux-tasks-close'; x.setAttribute('aria-label', 'Zamknij zadania'); x.textContent = '✕'; x.addEventListener('click', closeTasks); head.appendChild(x);
    panel.appendChild(head);
    var lead = document.createElement('p'); lead.className = 'ux-tasks-lead'; lead.textContent = 'Wybierz cel — włączę właściwe warstwy.'; panel.appendChild(lead);
    var msg = document.createElement('p'); msg.className = 'ux-tasks-msg'; msg.setAttribute('role', 'status');
    TASKS.forEach(function (task) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ux-task';
      var t = document.createElement('span'); t.className = 'ux-task-title'; t.textContent = task.title;
      var d = document.createElement('span'); d.className = 'ux-task-hint'; d.textContent = task.hint;
      var st = document.createElement('span'); st.className = 'ux-task-state'; st.textContent = task.layers ? (tasksState_[task.id] ? 'włączone' : '') : '›';
      b.appendChild(t); b.appendChild(st); b.appendChild(d);
      b.addEventListener('click', async function () {
        if (busy) return; busy = true; b.disabled = true;
        try {
          if (task.panel) {
            closeTasks();
            var pb = railButton(task.panel); if (pb) pb.click();
            return;
          }
          var on = !tasksState_[task.id];
          msg.textContent = on ? 'Włączam warstwy…' : 'Wyłączam warstwy…';
          var res = await setLayers(task.layers, on);
          tasksState_[task.id] = on && res.found.length > 0;
          st.textContent = tasksState_[task.id] ? 'włączone' : '';
          msg.textContent = (on ? 'Włączono: ' : 'Wyłączono: ') + res.found.length + ' z ' + task.layers.length + ' warstw' +
            (res.missing.length ? ' (brak: ' + res.missing.join(', ') + ')' : '') + '.';
        } finally { busy = false; b.disabled = false; }
      });
      panel.appendChild(b);
    });
    panel.appendChild(msg);
    shell.appendChild(panel);
    var r = rail.getBoundingClientRect();
    panel.style.right = Math.max(8, window.innerWidth - r.left + 8) + 'px';
    var tb = document.querySelector('.ux-tasks-button');
    if (tb) { tb.classList.add('is-active'); tb.setAttribute('aria-expanded', 'true'); }
  }

  function syncTasks() {
    var bar = document.querySelector('.activity-bar');
    if (!bar) return;
    if (!bar.querySelector('.ux-tasks-slot')) {
      var slot = document.createElement('div');
      slot.className = 'activity-bar-slot ux-tasks-slot';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-button activity-bar-button has-label ux-rail-extra ux-tasks-button';
      btn.setAttribute('aria-label', 'Zadania'); btn.setAttribute('aria-expanded', 'false');
      btn.title = 'Zadania: gotowe zestawy warstw do jednego celu';
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
      var pth = document.createElementNS(SVG_NS, 'path'); pth.setAttribute('d', 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2'); svg.appendChild(pth);
      var lab = document.createElement('span'); lab.className = 'activity-bar-label'; lab.setAttribute('aria-hidden', 'true'); lab.textContent = 'Zadania';
      btn.appendChild(svg); btn.appendChild(lab);
      btn.addEventListener('click', function () { if (document.querySelector('.ux-tasks')) closeTasks(); else buildTasks(); });
      slot.appendChild(btn);
      var firstSlot = bar.querySelector('.activity-bar-slot');
      if (firstSlot) bar.insertBefore(slot, firstSlot); else bar.appendChild(slot);
      // kliknięcie innego przycisku belki zamyka zadania
      bar.addEventListener('click', function (e) {
        if (busy) return; // kliknięcia wykonywane przez samo zadanie nie zamykają panelu zadań
        if (e.target.closest && e.target.closest('.ux-rail-extra')) return;
        if (e.target.closest && e.target.closest('.activity-bar-button')) closeTasks();
      });
    }
  }

  // 6. „Teren" — narzędzia analityczne w prawej belce (zamiast w grupie „Mierz") --------------------------
  var TOOLS = [
    { title: 'Profil wysokości', hint: 'Narysuj linię na mapie — pokażę przekrój terenu (NMT GUGiK)', match: 'Profil wysokości' },
    { title: 'Wysokości obszaru', hint: 'Działka, narysowany obszar albo prostokąt — statystyki wysokości', match: 'Wysokości obszaru' },
    { title: 'Model 3D terenu', hint: 'Kliknij działkę — trójwymiarowy model terenu z otoczeniem', match: 'Teren 3D' },
    { title: 'Zasięg (bufor)', hint: 'Wybierz obiekt i odległość — powstanie strefa wokół niego', match: 'Bufor wokół obiektu' }
  ];

  async function runTool(match) {
    var sel = '.tool-dock-tool[title^="' + match + '"]';
    if (!document.querySelector(sel)) {
      var g = document.querySelector('[data-tool-group="measurement"]');
      if (g) g.click();
      await until(function () { return document.querySelector(sel); }, 2500);
    }
    var t = document.querySelector(sel);
    if (t) t.click();
  }

  function buildTools() {
    var shell = document.querySelector('.app-shell');
    var rail = document.querySelector('.activity-bar');
    if (!shell || !rail) return;
    closeTasks();
    var openBtn = document.querySelector('.activity-bar .activity-bar-button.is-active[data-panel-id]');
    if (openBtn) openBtn.click();
    var panel = document.createElement('section');
    panel.className = 'ux-tasks ux-tools';
    panel.setAttribute('aria-label', 'Teren i zasięg');
    var head = document.createElement('div'); head.className = 'ux-tasks-head';
    var h = document.createElement('strong'); h.textContent = 'Teren i zasięg'; head.appendChild(h);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'ux-tasks-close'; x.setAttribute('aria-label', 'Zamknij'); x.textContent = '✕'; x.addEventListener('click', closeTasks); head.appendChild(x);
    panel.appendChild(head);
    var lead = document.createElement('p'); lead.className = 'ux-tasks-lead'; lead.textContent = 'Wybierz, co chcesz sprawdzić. Narzędzie włączy się na mapie.'; panel.appendChild(lead);
    TOOLS.forEach(function (tool) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ux-task';
      var t = document.createElement('span'); t.className = 'ux-task-title'; t.textContent = tool.title;
      var st = document.createElement('span'); st.className = 'ux-task-state'; st.textContent = '›';
      var d = document.createElement('span'); d.className = 'ux-task-hint'; d.textContent = tool.hint;
      b.appendChild(t); b.appendChild(st); b.appendChild(d);
      b.addEventListener('click', function () { closeTasks(); runTool(tool.match); });
      panel.appendChild(b);
    });
    shell.appendChild(panel);
    var r = rail.getBoundingClientRect();
    panel.style.right = Math.max(8, window.innerWidth - r.left + 8) + 'px';
    var tb = document.querySelector('.ux-tools-button');
    if (tb) { tb.classList.add('is-active'); tb.setAttribute('aria-expanded', 'true'); }
  }

  function syncTools() {
    var bar = document.querySelector('.activity-bar');
    if (!bar || bar.querySelector('.ux-tools-slot')) return;
    var slot = document.createElement('div');
    slot.className = 'activity-bar-slot ux-tools-slot';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-button activity-bar-button has-label ux-rail-extra ux-tools-button';
    btn.setAttribute('aria-label', 'Teren i zasięg'); btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Teren i zasięg: profil, wysokości, model 3D, bufor';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    var pth = document.createElementNS(SVG_NS, 'path'); pth.setAttribute('d', 'M3 19l6-11 4 7 3-4 5 8z'); svg.appendChild(pth);
    var lab = document.createElement('span'); lab.className = 'activity-bar-label'; lab.setAttribute('aria-hidden', 'true'); lab.textContent = 'Teren';
    btn.appendChild(svg); btn.appendChild(lab);
    btn.addEventListener('click', function () { if (document.querySelector('.ux-tools')) closeTasks(); else buildTools(); });
    slot.appendChild(btn);
    var exp = bar.querySelector('.ux-export-slot');
    if (exp) bar.insertBefore(slot, exp); else bar.appendChild(slot);
  }

  // 7. Telefon: „Zadania" w arkuszu Warstwy (zamiast „Szybkich warstw") ----------------------------------
  function toast(text) {
    var shell = document.querySelector('.app-shell');
    if (!shell) return;
    var old = shell.querySelector('.ux-toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'ux-toast'; t.setAttribute('role', 'status'); t.textContent = text;
    shell.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3800);
  }

  function syncMobileTasks() {
    var body = document.querySelector('.m-layers-sheet .m-sheet-body');
    if (!body || body.querySelector('.ux-m-tasks')) return;
    var anchor = body.querySelector('.m-list-button');
    var wrap = document.createElement('div'); wrap.className = 'ux-m-tasks';
    var h = document.createElement('h3'); h.className = 'm-section-title'; h.textContent = 'Zadania'; wrap.appendChild(h);
    TASKS.filter(function (t) { return t.layers; }).forEach(function (task) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ux-task';
      var t = document.createElement('span'); t.className = 'ux-task-title'; t.textContent = task.title;
      var st = document.createElement('span'); st.className = 'ux-task-state'; st.textContent = tasksState_[task.id] ? 'włączone' : '';
      var d = document.createElement('span'); d.className = 'ux-task-hint'; d.textContent = task.hint;
      b.appendChild(t); b.appendChild(st); b.appendChild(d);
      b.addEventListener('click', async function () {
        if (busy) return; busy = true; b.disabled = true;
        try {
          var on = !tasksState_[task.id];
          var res = await setLayers(task.layers, on);
          tasksState_[task.id] = on && res.found.length > 0;
          toast((on ? 'Włączono: ' : 'Wyłączono: ') + res.found.length + ' z ' + task.layers.length + ' warstw — ' + task.title);
        } finally { busy = false; b.disabled = false; }
      });
      wrap.appendChild(b);
    });
    if (anchor) body.insertBefore(wrap, anchor); else body.appendChild(wrap);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(sync);
  }

  function start() {
    var root = document.body; // menu i okna Radix są poza #root
    if (!root || !window.MutationObserver) return;
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
