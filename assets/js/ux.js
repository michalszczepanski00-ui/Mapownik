/*
 * Mapownik — dodatek interfejsu (propozycja do 19.50.0). Zwykły skrypt (nie moduł), ładowany po boot.js.
 *
 * Robi dwie rzeczy i nic więcej; gdy któregoś elementu strony nie ma, po prostu go pomija:
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

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(sync);
  }

  function start() {
    var root = document.getElementById('root') || document.body;
    if (!root || !window.MutationObserver) return;
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
