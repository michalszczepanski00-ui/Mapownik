// Lekki JS: nagłówek, menu mobilne, ujawnianie sekcji, liczniki, efekty kart, formularz przygotowujący e-mail.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// nagłówek: jasny po zjechaniu z ciemnego bloku
const hd = $('#hd');
const bm = $('.bar-m');
const solid = () => { hd.classList.toggle('solid', window.scrollY > 30); if (bm) bm.classList.toggle('show', window.scrollY > 520); };
window.addEventListener('scroll', solid, { passive: true });
solid();

// menu mobilne
const tg = $('#tg'), nv = $('#nv');
const setNav = (open) => { nv.classList.toggle('open', open); tg.setAttribute('aria-expanded', String(open)); };
tg.addEventListener('click', () => setNav(!nv.classList.contains('open')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nv.classList.contains('open')) { setNav(false); tg.focus(); } });
$$('#nv a').forEach((a) => a.addEventListener('click', () => setNav(false)));

// ujawnianie przy przewijaniu + liczniki
const count = (el) => {
  if (el.dataset.done) return; el.dataset.done = 1;
  const to = +el.dataset.count, suf = el.dataset.suffix || '', pre = el.dataset.prefix || '';
  if (reduce) { el.textContent = pre + to + suf; return; }
  let t0 = null;
  const step = (t) => { t0 ??= t; const p = Math.min(1, (t - t0) / 1600); el.textContent = pre + Math.round(to * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
};
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); io.unobserve(e.target);
  $$('[data-count]', e.target).forEach(count); if (e.target.dataset.count) count(e.target);
}), { threshold: 0.15 });
$$('.rv').forEach((el) => io.observe(el));
$$('.scale').forEach((el) => setTimeout(() => el.classList.add('in'), 350));

// hasło: słowa zapalają się przy przewijaniu
const say = $('#say');
if (say) {
  const keys = (say.dataset.keys || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  say.innerHTML = say.textContent.trim().split(/\s+/).map((w) => `<span class="w${keys.some((k) => w.toLowerCase().startsWith(k)) ? ' key' : ''}">${w}</span>`).join(' ');
  const words = $$('.w', say);
  const upd = () => {
    if (reduce) { words.forEach((w) => w.classList.add('on')); return; }
    const r = say.getBoundingClientRect(), vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const n = Math.round(p * words.length * 1.15);
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  };
  window.addEventListener('scroll', upd, { passive: true }); upd();
}

// oś procesu wypełnia się przy przewijaniu
$$('.rail').forEach((rail) => {
  const fill = $('.fill', rail); if (!fill) return;
  const upd = () => {
    const b = rail.getBoundingClientRect(), q = Math.min(1, Math.max(0, (window.innerHeight * 0.7 - b.top) / b.height));
    if (window.matchMedia('(min-width:901px)').matches) { fill.style.width = q * 100 + '%'; fill.style.height = ''; } else { fill.style.height = q * 100 + '%'; fill.style.width = ''; }
  };
  window.addEventListener('scroll', upd, { passive: true }); upd();
});

// blask kart pod kursorem
$$('.card').forEach((c) => c.addEventListener('pointermove', (e) => {
  const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
}));

// pochylenie zdjęcia w hero
const vis = $('#vis'), fr = $('#frame');
if (vis && fr && !reduce && window.matchMedia('(hover:hover)').matches) {
  vis.addEventListener('pointermove', (e) => { const r = vis.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; fr.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`; });
  vis.addEventListener('pointerleave', () => { fr.style.transform = ''; });
}

// formularz: przygotowuje gotowy e-mail (bez wysyłania danych na serwer)
$$('form[data-mailform]').forEach((form) => {
  const to = form.dataset.to, status = $('[data-status]', form), copyBtn = $('[data-copy]', form);
  const build = () => {
    const f = Object.fromEntries(new FormData(form).entries());
    const line = (k, v) => (v ? `${k}: ${v}\n` : '');
    const body = `Dzień dobry,\n\nprzesyłam zapytanie o wycenę.\n\n` + line('Rodzaj opracowania', f.usluga) + line('Typ budynku', f.budynek) + line('Lokalizacja', f.lokalizacja) + line('Liczba obiektów', f.liczba) + line('Oczekiwany termin', f.termin) + line('Firma', f.firma) + (f.opis ? `\nOpis:\n${f.opis}\n` : '') + `\n(Dokumentację projektową dołączam jako załącznik.)\n`;
    const subject = `Zapytanie ze strony świadectwa.net${f.usluga ? ' – ' + f.usluga : ''}`;
    return { subject, body };
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (form.website && form.website.value) return;
    const { subject, body } = build();
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (status) status.textContent = `Otwieramy Twój program pocztowy. Jeżeli się nie otworzył, skopiuj treść i wyślij ją na adres ${to}.`;
    if (copyBtn) copyBtn.hidden = false;
  });
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const { subject, body } = build();
    try { await navigator.clipboard.writeText(`Do: ${to}\nTemat: ${subject}\n\n${body}`); if (status) status.textContent = 'Treść zapytania skopiowana. Wklej ją do wiadomości e-mail.'; }
    catch { if (status) status.textContent = `Nie udało się skopiować. Napisz bezpośrednio na ${to}.`; }
  });
});
