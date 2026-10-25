/* Little Memories Club — app logic (no build step) */
(() => {
  'use strict';

  /* ---------- config ---------- */
  const CFG = window.LMC_CONFIG || {};
  const SUPABASE_URL = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = String(CFG.supabaseKey || '');
  const configured = !!(SUPABASE_URL && KEY);
  const MAX_FILES = 6;
  const MAX_ORIGINAL = 25 * 1024 * 1024;   // before in-browser resizing
  const MAX_UPLOAD = 8 * 1024 * 1024;      // after resizing (matches server limit)
  const MAX_DIM = 2000;
  const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const WALL_ROUTE = /^\/w\/([0-9a-f]{32})\/?$/i;
  const BASE_TITLE = document.title;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const html = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const scrollToEl = (target) => target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
  const theme = () => html.dataset.theme || 'pink';

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = el('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  /* ==========================================================
     Scroll reveal + parallax
     ========================================================== */
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    : null;
  const observe = (node) => { if (io) io.observe(node); else node.classList.add('in'); };

  const parallaxEls = $$('[data-parallax]');
  let ticking = false;
  function onScroll() {
    if (reduced.matches || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.5) {
        parallaxEls.forEach((p) => { p.style.translate = `0 ${(-y * Number(p.dataset.parallax)).toFixed(1)}px`; });
      }
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* ==========================================================
     Floating decorations (rebuilt per theme)
     ========================================================== */
  const decor = $('#decor');
  function fl(name, cls, v) {
    const s = el('span', 'fl ' + cls);
    for (const k in v) s.style.setProperty('--' + k, v[k]);
    s.style.setProperty('--rt', R(2, 96).toFixed(1) + '%');
    s.style.setProperty('--rl', R(2, 94).toFixed(1) + '%');
    s.innerHTML = `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
    return s;
  }

  function buildDecor(name) {
    decor.textContent = '';
    const frag = document.createDocumentFragment();
    const k = innerWidth < 640 ? 0.55 : 1;
    const n = (c) => Math.max(2, Math.round(c * k));

    if (name === 'pink') {
      const P = ['#F4BFD3', '#D94B70', '#B78BA2', '#F8DCE8'];
      for (let i = 0; i < n(12); i++) frag.append(fl('heart', 'rise', { s: R(14, 34) + 'px', x: R(0, 98) + '%', y: '102%', c: pick(P), d: R(14, 26) + 's', dl: -R(0, 26) + 's', sw: R(-40, 40) + 'px', o: R(.45, .85).toFixed(2) }));
      for (let i = 0; i < n(10); i++) frag.append(fl('sparkle', 'twinkle', { s: R(10, 24) + 'px', x: R(2, 96) + '%', y: R(3, 95) + '%', c: pick(['#ffffff', '#F4BFD3', '#D94B70']), d: R(2.5, 5) + 's', dl: -R(0, 5) + 's' }));
      [['3%', '58%'], ['92%', '44%'], ['10%', '88%']].forEach(([x, y], i) =>
        frag.append(fl('bow', 'sway', { s: R(30, 44) + 'px', x, y, c: i % 2 ? '#F4BFD3' : '#D94B70', d: R(5, 8) + 's', o: .8 })));
    } else if (name === 'garden') {
      for (let i = 0; i < n(7); i++) frag.append(fl('leaf', 'drift', { s: R(16, 30) + 'px', x: '-8%', y: R(5, 85) + '%', c: pick(['#748B67', '#B7C9A8', '#344D38']), d: R(40, 72) + 's', dl: -R(0, 72) + 's', dy: R(-12, 12) + 'vh', o: .6 }));
      for (let i = 0; i < n(6); i++) frag.append(fl('petal', 'fall', { s: R(12, 22) + 'px', x: R(0, 98) + '%', y: '-6%', c: pick(['#ffffff', '#F2E5A7', '#F8DCE8']), d: R(22, 40) + 's', dl: -R(0, 40) + 's', sw: R(-60, 60) + 'px', o: .75 }));
      [6, 27, 72, 92].slice(0, Math.max(3, Math.round(4 * k))).forEach((x) =>
        frag.append(fl('daisy', 'sway', { s: R(36, 60) + 'px', x: x + '%', y: R(86, 94) + '%', c: '#ffffff', d: R(5, 8) + 's', o: .85 })));
      for (let i = 0; i < n(3); i++) frag.append(fl('butterfly', 'flutter', { s: R(24, 34) + 'px', x: R(5, 35) + '%', y: R(15, 70) + '%', c: pick(['#F2E5A7', '#B7C9A8', '#ffffff']), d: R(32, 48) + 's', dl: -R(0, 32) + 's', o: .85 }));
    } else {
      for (let i = 0; i < n(4); i++) {
        const s = el('span', 'strand');
        s.style.cssText = `--x:${R(8, 94).toFixed(1)}%;--len:${Math.round(R(70, 210))}px;--d:${R(4, 7).toFixed(1)}s;--dl:${-R(0, 5).toFixed(1)}s`;
        s.innerHTML = '<svg aria-hidden="true"><use href="#i-spider"/></svg>';
        frag.append(s);
      }
      const words = [['POW!', '#E63946'], ['CLICK!', '#3B82F6'], ['MEMORY SAVED!', '#E63946'], ['ZAP!', '#3B82F6'], ['THWIP!', '#E63946'], ['WOW!', '#3B82F6']];
      for (let i = 0; i < n(6); i++) {
        const [w, c] = words[i % words.length];
        const s = fl('burst', 'sticker', { s: R(78, 116) + 'px', x: R(2, 90) + '%', y: R(8, 70) + '%', c, rot: R(-14, 14) + 'deg', o: .55 });
        s.style.animationDelay = (-R(0, 5)).toFixed(1) + 's';
        const b = el('b', null, w);
        s.append(b);
        frag.append(s);
      }
      for (const side of ['tl', 'tr']) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('class', 'corner-web ' + side);
        s.setAttribute('aria-hidden', 'true');
        s.innerHTML = '<use href="#i-web"/>';
        frag.append(s);
      }
    }
    decor.append(frag);
    decor.style.animation = 'none';
    void decor.offsetWidth;
    decor.style.animation = '';
    buildFloaters(name);
  }

  /* ==========================================================
     Theme switching
     ========================================================== */
  const THEMES = { pink: '#F8DCE8', garden: '#EAF0DC', spider: '#101A36' };
  const radios = $$('[data-theme-choice]');
  let switching = false;

  function syncRadios(name) {
    radios.forEach((r) => {
      const on = r.dataset.themeChoice === name;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    });
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = THEMES[name];
  }

  function applyTheme(name) {
    html.dataset.theme = name;
    try { localStorage.setItem('lmc-theme', name); } catch { /* storage may be blocked */ }
    syncRadios(name);
    buildDecor(name);
    html.classList.add('themed');
    setTimeout(() => html.classList.remove('themed'), 700);
  }

  function setTheme(name) {
    if (!THEMES[name] || name === theme() || switching) return;
    if (reduced.matches) { applyTheme(name); return; }
    switching = true;
    const veil = $('#theme-fade');
    veil.style.setProperty('--fade', THEMES[name]);
    veil.classList.add('on');
    setTimeout(() => {
      applyTheme(name);
      veil.classList.remove('on');
      setTimeout(() => { switching = false; }, 300);
    }, 300);
  }

  radios.forEach((r) => {
    r.addEventListener('click', () => setTheme(r.dataset.themeChoice));
    r.addEventListener('keydown', (e) => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const i = radios.indexOf(r);
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = radios[(i + dir + radios.length) % radios.length];
      next.focus();
      setTheme(next.dataset.themeChoice);
    });
  });

  /* ==========================================================
     Cursor + particles (fine pointers only)
     ========================================================== */
  const fx = $('#fx');
  const icon = (name, size, color) =>
    `<svg width="${size}" height="${size}" style="color:${color}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function particle(content, x, y, cls, vars, w) {
    const p = el('span', 'p ' + cls);
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    if (w) p.style.width = w + 'px';
    for (const k in vars) p.style.setProperty(k, vars[k]);
    if (content) p.innerHTML = content;
    fx.appendChild(p);
    const kill = () => p.remove();
    p.addEventListener('animationend', kill, { once: true });
    setTimeout(kill, 2200);
    return p;
  }

  const PINK_C = ['#F4BFD3', '#D94B70', '#ffffff', '#B78BA2'];
  const GARDEN_C = ['#748B67', '#B7C9A8', '#F2E5A7', '#ffffff'];

  function burstAt(x, y, count, spread, cls) {
    const t = theme();
    if (t === 'spider') {
      const word = pick(['POW!', 'ZAP!', 'THWIP!', 'WOW!']);
      const p = particle(`<svg width="86" height="86" aria-hidden="true"><use href="#i-burst"/></svg><b>${word}</b>`, x, y, 'pow', {});
      p.style.width = '86px'; p.style.height = '86px';
      return;
    }
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + R(-0.3, 0.3);
      const d = R(spread * 0.5, spread);
      const name = t === 'pink' ? (i % 3 ? 'heart' : 'sparkle') : (i % 2 ? 'petal' : 'leaf');
      const col = pick(t === 'pink' ? PINK_C : GARDEN_C);
      particle(icon(name, Math.round(R(10, 18)), col), x, y, cls, {
        '--dx': Math.cos(a) * d + 'px',
        '--dy': Math.sin(a) * d + 'px',
        '--rot': R(-120, 120) + 'deg',
      });
    }
  }

  function celebrate(x, y) {
    if (reduced.matches) return;
    if (theme() === 'spider') {
      burstAt(x, y, 1, 0, 'burst');
      for (let i = 0; i < 18; i++) {
        const a = R(0, Math.PI * 2), d = R(70, 230);
        particle(icon(i % 2 ? 'burst' : 'sparkle', Math.round(R(10, 20)), pick(['#E63946', '#3B82F6', '#ffffff'])), x, y, 'confetti', {
          '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', '--rot': R(-200, 200) + 'deg',
        });
      }
      return;
    }
    burstAt(x, y, 26, 230, 'confetti');
  }

  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (fine.matches) {
    html.classList.add('has-cursor');
    const cur = $('#cursor');
    let cx = 0, cy = 0, raf = 0, lx = 0, ly = 0, lastT = 0;

    const frame = () => {
      raf = 0;
      cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    };

    addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const px = cx, py = cy;
      cx = e.clientX; cy = e.clientY;
      cur.classList.add('on');
      if (!raf) raf = requestAnimationFrame(frame);

      if (reduced.matches) return;
      const dx = cx - lx, dy = cy - ly;
      const dist = Math.hypot(dx, dy);
      const now = performance.now();
      if (dist < 24 || now - lastT < 40 || fx.childElementCount > 26) return;
      const t = theme();
      if (t === 'spider') {
        const len = Math.min(dist, 60);
        const p = particle('', lx || px, ly || py, 'strand-t', { rotate: Math.atan2(dy, dx) + 'rad' }, len);
        void p;
      } else if (t === 'pink') {
        particle(icon(Math.random() < .5 ? 'sparkle' : 'heart', Math.round(R(9, 15)), pick(PINK_C)), cx, cy, 'trail', { '--dx': R(-12, 12) + 'px', '--dy': R(8, 24) + 'px', '--rot': R(-90, 90) + 'deg' });
      } else {
        particle(icon(Math.random() < .55 ? 'leaf' : 'petal', Math.round(R(10, 16)), pick(GARDEN_C)), cx, cy, 'trail', { '--dx': R(-18, 18) + 'px', '--dy': R(14, 34) + 'px', '--rot': R(-180, 180) + 'deg' });
      }
      lx = cx; ly = cy; lastT = now;
    }, { passive: true });

    document.addEventListener('pointerover', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      cur.classList.toggle('hover', !!t.closest('a, button, label, summary, select, [role="button"], [role="radio"], .card, .theme-card, .floater'));
      cur.classList.toggle('text', !!t.closest('textarea, input:not([type="checkbox"]):not([type="file"])'));
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (reduced.matches) return;
      burstAt(e.clientX, e.clientY, 7, 56, 'burst');
    });
    document.addEventListener('mouseleave', () => cur.classList.remove('on'));
    document.addEventListener('mouseenter', () => cur.classList.add('on'));
  }

  /* ==========================================================
     Supabase: login (supabase-js) + our Edge Functions
     ========================================================== */
  let sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  let session = null;

  async function accessToken() {
    if (!sb) { session = null; return ''; }
    const { data } = await sb.auth.getSession();
    session = data.session || null;
    return session ? session.access_token : '';
  }

  // auth: 'required' (must be logged in) | 'optional' (send login if there is one) | false
  async function call(action, payload = {}, auth = false) {
    const headers = { 'Content-Type': 'application/json', apikey: KEY };
    if (auth) {
      const t = await accessToken();
      if (t) headers.Authorization = 'Bearer ' + t;
      else if (auth === 'required') { const e = new Error('Please log in again.'); e.status = 401; throw e; }
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/wall-api`, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
    return j;
  }

  // anonymous id for this device, used only so a visitor can like a picture once
  let memVoter = '';
  function voterId() {
    try {
      let v = localStorage.getItem('lmc-voter');
      if (!v) { v = crypto.randomUUID(); localStorage.setItem('lmc-voter', v); }
      return v;
    } catch { return memVoter || (memVoter = crypto.randomUUID()); }
  }

  /* ---------- state ---------- */
  let view = 'landing';          // 'landing' | 'owner' | 'viewer'
  let wall = null;               // { title, share_token? }
  let wallToken = '';            // token of the wall being viewed (viewer mode)
  const memories = [];
  let total = 0, hasMore = false, loading = false, loadedOnce = false;
  let pendingOpen = new URLSearchParams(location.search).get('m') || '';
  const grid = $('#grid');
  const shareUrl = () => (wall && wall.share_token ? `${location.origin}/w/${wall.share_token}` : '');
  const currentWallUrl = () => (view === 'owner' ? shareUrl() : `${location.origin}/w/${wallToken}`);

  /* ==========================================================
     Memory cards + likes
     ========================================================== */
  function hash(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function metaText(m, full) {
    const parts = [];
    if (m.display_name) parts.push('by ' + m.display_name);
    if (m.memory_date) parts.push(fmtDate(m.memory_date));
    else parts.push('shared ' + fmtDate(m.created_at));
    if (full && m.memory_date) parts.push('shared ' + fmtDate(m.created_at));
    return parts.join(' · ');
  }
  const altFor = (m) => `Photo${m.display_name ? ' shared by ' + m.display_name : ''}: ${String(m.caption).slice(0, 110)}`;

  function makeImg(m, image, i) {
    const img = new Image();
    img.alt = altFor(m) + (m.images.length > 1 ? ` (picture ${i + 1} of ${m.images.length})` : '');
    img.decoding = 'async';
    img.loading = 'lazy';
    if (image.width && image.height) { img.width = image.width; img.height = image.height; }
    img.src = image.url;
    return img;
  }

  function paintBtn(b, m) {
    const n = m.like_count || 0;
    b.textContent = `${m.liked ? '♥' : '♡'} ${n}`;
    b.setAttribute('aria-pressed', String(!!m.liked));
    b.setAttribute('aria-label', view === 'viewer'
      ? `${m.liked ? 'Remove your like' : 'Like this memory'} (${n} ${n === 1 ? 'like' : 'likes'})`
      : `${n} ${n === 1 ? 'like' : 'likes'}`);
  }
  function paintLikes(m) { $$(`[data-like="${m.id}"]`).forEach((b) => paintBtn(b, m)); }

  async function toggleLike(m, btn) {
    if (view !== 'viewer' || m._busy) return;
    m._busy = true;
    const on = !m.liked;
    m.liked = on;
    m.like_count = Math.max(0, (m.like_count || 0) + (on ? 1 : -1));
    paintLikes(m);
    if (on && btn && !reduced.matches) { const r = btn.getBoundingClientRect(); burstAt(r.left + r.width / 2, r.top + r.height / 2, 8, 60, 'burst'); }
    try {
      const r = await call('like', { token: wallToken, memory_id: m.id, voter_id: voterId(), on });
      m.like_count = r.like_count;
    } catch (err) {
      m.liked = !on;
      m.like_count = Math.max(0, (m.like_count || 0) + (on ? -1 : 1));
      toast(err.message);
    } finally {
      m._busy = false;
      paintLikes(m);
    }
  }

  function likeBtn(m, cls) {
    const b = el('button', cls || 'like');
    b.type = 'button';
    b.dataset.like = m.id;
    if (view !== 'viewer') { b.disabled = true; b.title = 'Hearts from the people you share your wall with'; }
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(m, b); });
    paintBtn(b, m);
    return b;
  }

  function makeCard(m, index) {
    const a = el('article', 'card');
    a.tabIndex = 0;
    a.setAttribute('role', 'group');
    a.setAttribute('aria-label', `Memory: ${String(m.caption).slice(0, 80)}`);
    a.dataset.id = m.id;
    a.style.setProperty('--rot', (((hash(m.id) % 9) - 4) * 0.7).toFixed(2) + 'deg');
    a.style.setProperty('--i', String(index % 6));

    const first = m.images[0];
    const box = el('div', 'card-img');
    if (first.width && first.height) box.style.aspectRatio = `${first.width} / ${first.height}`;
    const img = makeImg(m, first, 0);
    img.addEventListener('load', () => box.classList.add('loaded'));
    img.addEventListener('error', () => { box.classList.add('loaded'); img.alt = 'This picture could not be loaded'; });
    box.append(img);
    if (m.images.length > 1) box.append(el('span', 'more', `+${m.images.length - 1} more`));

    const body = el('div', 'card-body');
    const foot = el('div', 'card-foot');
    foot.append(likeBtn(m), el('p', 'meta', metaText(m)));
    body.append(el('p', 'cap', m.caption), foot);
    a.append(box, body);

    a.addEventListener('click', () => openLightbox(m.id));
    a.addEventListener('keydown', (e) => {
      if (e.target === a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLightbox(m.id); }
    });
    observe(a);
    return a;
  }

  function updateWallState() {
    $('#empty').hidden = !(loadedOnce && memories.length === 0);
    $('#more').hidden = !hasMore;
    const n = total || memories.length;
    const count = memories.length ? `${n} ${n === 1 ? 'memory' : 'memories'} so far` : '';
    $('#wall-count').textContent = view === 'viewer' && wall ? [wall.title, count].filter(Boolean).join(' · ') : count;
    $('#empty-text').textContent = view === 'viewer' ? 'This wall is waiting for its first little memory ♡' : 'The scrapbook is waiting for its first little memory ♡';
    $('#empty-add').hidden = view !== 'owner';
  }

  function resetWall() {
    memories.length = 0;
    grid.textContent = '';
    total = 0; hasMore = false; loadedOnce = false; wall = null;
    $('#wall-error').hidden = true;
    updateWallState();
  }

  async function loadWall(reset) {
    if (loading || !configured || !sb) return;
    loading = true;
    if (reset) resetWall();
    $('#loading').hidden = false;
    $('#wall-error').hidden = true;
    $('#more').disabled = true;
    let toOwner = false;
    try {
      const offset = memories.length;
      const res = view === 'owner'
        ? await call('mine', { offset }, 'required')
        : await call('view', { token: wallToken, offset, voter_id: voterId() }, 'optional');
      if (view === 'viewer' && res.is_owner) {
        toOwner = true;       // you opened your own link: just take you to your wall
      } else {
        wall = res.wall;
        if (view === 'owner') renderShare();
        const seen = new Set(memories.map((m) => m.id));
        const rows = res.memories.filter((r) => !seen.has(r.id));
        const start = memories.length;
        memories.push(...rows);
        const frag = document.createDocumentFragment();
        rows.forEach((m, i) => frag.append(makeCard(m, start + i)));
        grid.append(frag);
        total = res.total; hasMore = res.has_more; loadedOnce = true;
        if (view === 'viewer') {
          $('#viewer-line').textContent = `You're visiting ${wall.title}`;
          document.title = `${wall.title} · Little Memories Club`;
        }
        if (pendingOpen) {
          const id = pendingOpen; pendingOpen = '';
          if (memories.some((m) => m.id === id)) openLightbox(id);
        }
      }
    } catch (err) {
      console.error(err);
      $('#wall-error-msg').textContent = err.status === 404 || err.status === 401 ? err.message : 'We couldn’t open the scrapbook just now.';
      $('#retry').hidden = err.status === 404 || err.status === 401;
      $('#wall-error').hidden = false;
    } finally {
      loading = false;
      $('#loading').hidden = true;
      $('#more').disabled = false;
      updateWallState();
    }
    if (toOwner) { history.replaceState({}, '', '/'); route(); }
  }
  $('#more').addEventListener('click', () => loadWall(false));
  $('#retry').addEventListener('click', () => loadWall(false));

  function addNewMemory(m) {
    memories.unshift(m);
    total = Math.max(total + 1, memories.length);
    loadedOnce = true;
    const card = makeCard(m, 0);
    card.classList.add('fresh');
    grid.prepend(card);
    updateWallState();
  }

  function removeFromWall(id) {
    const idx = memories.findIndex((x) => x.id === id);
    if (idx >= 0) { memories.splice(idx, 1); total = Math.max(0, total - 1); }
    const node = grid.querySelector(`[data-id="${id}"]`);
    if (node) node.remove();
    updateWallState();
  }

  async function deleteMemory(m) {
    if (!confirm('Delete this memory? It will disappear from your wall and cannot be undone.')) return false;
    try {
      await call('delete', { memory_id: m.id }, 'required');
      removeFromWall(m.id);
      toast('Memory deleted.');
      return true;
    } catch (err) { toast(err.message); return false; }
  }

  /* ==========================================================
     Lightbox
     ========================================================== */
  const lb = $('#lightbox');
  const lbImg = $('#lb-img');
  const lbState = { index: -1, img: 0, last: null };

  function renderLightbox() {
    const m = memories[lbState.index];
    if (!m) return;
    const image = m.images[lbState.img] || m.images[0];
    lbImg.src = image.url;
    lbImg.alt = altFor(m);
    $('#lb-cap').textContent = m.caption;
    $('#lb-meta').textContent = metaText(m, true);
    const thumbs = $('#lb-thumbs');
    thumbs.textContent = '';
    if (m.images.length > 1) {
      m.images.forEach((im, i) => {
        const b = el('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Show picture ${i + 1} of ${m.images.length}`);
        b.setAttribute('aria-current', String(i === lbState.img));
        const t = new Image();
        t.alt = ''; t.src = im.url; t.loading = 'lazy';
        b.append(t);
        b.addEventListener('click', () => { lbState.img = i; renderLightbox(); });
        thumbs.append(b);
      });
    }
    const like = $('#lb-like');
    like.hidden = false;
    like.dataset.like = m.id;
    like.disabled = view !== 'viewer';
    paintBtn(like, m);
    $('#lb-delete').hidden = view !== 'owner';
    $('#lb-prev').disabled = lbState.index <= 0;
    $('#lb-next').disabled = lbState.index >= memories.length - 1 && !hasMore;
    [memories[lbState.index + 1], memories[lbState.index - 1]].forEach((n) => { if (n) new Image().src = n.images[0].url; });
  }

  function openLightbox(id) {
    const i = memories.findIndex((m) => m.id === id);
    if (i < 0) return;
    lbState.index = i; lbState.img = 0;
    lbState.last = document.activeElement;
    lb.hidden = false;
    html.classList.add('lb-open');
    renderLightbox();
    $('#lb-close').focus();
  }
  function closeLightbox() {
    if (lb.hidden) return;
    lb.hidden = true;
    html.classList.remove('lb-open');
    lbImg.removeAttribute('src');
    if (lbState.last && lbState.last.focus) lbState.last.focus({ preventScroll: true });
  }
  async function stepLightbox(dir) {
    if (dir > 0 && lbState.index >= memories.length - 1 && hasMore) await loadWall(false);
    const next = lbState.index + dir;
    if (next < 0 || next >= memories.length) return;
    lbState.index = next; lbState.img = 0;
    renderLightbox();
  }

  $('#lb-close').addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.hasAttribute('data-close')) closeLightbox(); });
  $('#lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('#lb-next').addEventListener('click', () => stepLightbox(1));
  $('#lb-like').addEventListener('click', () => { const m = memories[lbState.index]; if (m) toggleLike(m, $('#lb-like')); });
  $('#lb-copy').addEventListener('click', async () => {
    const m = memories[lbState.index];
    const ok = await copyText(`${currentWallUrl()}?m=${m.id}`);
    toast(ok ? 'Link copied ♡' : 'Couldn’t copy — long-press the link instead');
  });
  $('#lb-delete').addEventListener('click', async () => {
    const idx = lbState.index;
    const m = memories[idx];
    if (!m || !(await deleteMemory(m))) return;
    if (!memories.length) closeLightbox();
    else { lbState.index = Math.min(idx, memories.length - 1); lbState.img = 0; renderLightbox(); }
  });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
    else if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
    else if (e.key === 'Tab') {
      const f = $$('button:not([disabled]):not([hidden]), a[href]', lb).filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  (() => {
    const stage = $('#lb-stage');
    let sx = 0, sy = 0, active = false;
    stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { sx = e.clientX; sy = e.clientY; active = true; } });
    stage.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepLightbox(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', () => { active = false; });
  })();

  /* ==========================================================
     Views, routing, top bar
     ========================================================== */
  function renderTopbar() {
    const bar = $('#topbar');
    bar.textContent = '';
    if (!session) { bar.hidden = true; return; }
    bar.hidden = false;
    const name = String((session.user.user_metadata && session.user.user_metadata.name) || '').trim();
    bar.append(el('span', 'who', name ? `Hi, ${name}` : 'Hi there'));
    if (view !== 'owner') { const a = el('a', 'btn btn-glass small', 'My wall'); a.href = '/'; bar.append(a); }
    const out = el('button', 'btn btn-glass small', 'Log out');
    out.type = 'button';
    out.addEventListener('click', logout);
    bar.append(out);
  }

  function setView(v) {
    view = v;
    document.body.dataset.view = v;
    $$('[data-views]').forEach((n) => { n.hidden = !n.dataset.views.split(' ').includes(v); });
    const p = $('#hero-primary'), s = $('#hero-secondary');
    if (v === 'landing') { p.textContent = '＋ Create my wall'; p.href = '#auth'; s.textContent = '✧ Choose a theme'; s.href = '#themes'; }
    else if (v === 'owner') { p.textContent = '＋ Add a memory'; p.href = '#upload'; s.textContent = '♡ Explore the memories'; s.href = '#wall'; }
    else { p.textContent = '♡ See the memories'; p.href = '#wall'; s.textContent = '＋ Make my own wall'; s.href = '/'; }
    renderTopbar();
  }

  async function route() {
    closeLightbox();
    await accessToken();
    const m = location.pathname.match(WALL_ROUTE);
    document.title = BASE_TITLE;
    if (m) {
      wallToken = m[1].toLowerCase();
      setView('viewer');
      loadWall(true);
    } else if (session) {
      setView('owner');
      loadWall(true);
    } else {
      setView('landing');
      resetWall();
      $('#loading').hidden = true;
    }
  }
  addEventListener('popstate', route);

  async function logout() {
    try { await sb.auth.signOut(); } catch { /* ignore */ }
    session = null;
    window.scrollTo(0, 0);
    route();
  }

  /* ---------- share panel (owner) ---------- */
  function renderShare() {
    $('#share-url').value = shareUrl();
    $('#wall-title').value = wall ? wall.title : '';
  }
  $('#share-url').addEventListener('focus', (e) => e.target.select());
  $('#share-copy').addEventListener('click', async () => toast((await copyText(shareUrl())) ? 'Wall link copied ♡ Send it to people you love' : 'Couldn’t copy — select the link and copy it'));
  $('#title-save').addEventListener('click', async () => {
    try { const r = await call('title', { title: $('#wall-title').value }, 'required'); wall.title = r.title; toast('Saved ♡'); }
    catch (err) { toast(err.message); }
  });
  $('#share-rotate').addEventListener('click', async () => {
    if (!confirm('Make a new link? The old link will stop working for everyone who has it, so you will need to send the new one.')) return;
    try { const r = await call('rotate', {}, 'required'); wall.share_token = r.share_token; renderShare(); toast('New link ready ♡'); }
    catch (err) { toast(err.message); }
  });

  /* ==========================================================
     Log in / sign up / reset password
     ========================================================== */
  let authMode = 'login';
  const authForm = $('#auth-form');
  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === 'signup';
    $('#tab-login').setAttribute('aria-selected', String(!signup));
    $('#tab-signup').setAttribute('aria-selected', String(signup));
    $('#f-name').hidden = !signup;
    $('#auth-submit').textContent = signup ? 'Create my wall ♡' : 'Log in';
    $('#auth-pass').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auth-forgot').hidden = signup;
    $('#err-auth').textContent = ''; $('#ok-auth').textContent = '';
  }
  $('#tab-login').addEventListener('click', () => setAuthMode('login'));
  $('#tab-signup').addEventListener('click', () => setAuthMode('signup'));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err-auth'), ok = $('#ok-auth');
    err.textContent = ''; ok.textContent = '';
    if (!sb) { err.textContent = 'The site isn’t connected to Supabase yet — see the README.'; return; }
    const email = $('#auth-email').value.trim();
    const password = $('#auth-pass').value;
    const name = $('#auth-name').value.trim();
    if (!EMAIL_RE.test(email)) { err.textContent = 'Please enter a valid email address.'; $('#auth-email').focus(); return; }
    if (password.length < 8) { err.textContent = 'Your password needs at least 8 characters.'; $('#auth-pass').focus(); return; }
    if (authMode === 'signup' && !name) { err.textContent = 'Please tell us your name — it goes on your wall.'; $('#auth-name').focus(); return; }
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
        if (!data.session) { setAuthMode('login'); ok.textContent = 'Almost there! Check your email and click the confirmation link, then log in.'; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      authForm.reset();
      history.replaceState({}, '', '/');
      await route();
      setTimeout(() => scrollToEl($('#share')), 300);
    } catch (ex) {
      err.textContent = ex && ex.message ? ex.message : 'Something went wrong. Please try again.';
    } finally { btn.disabled = false; }
  });

  $('#auth-forgot').addEventListener('click', async () => {
    const err = $('#err-auth'), ok = $('#ok-auth');
    err.textContent = ''; ok.textContent = '';
    const email = $('#auth-email').value.trim();
    if (!sb || !EMAIL_RE.test(email)) { err.textContent = 'Type your email above first, then tap “Forgot your password?”.'; $('#auth-email').focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    if (error) err.textContent = error.message;
    else ok.textContent = 'If that email has an account, a reset link is on its way.';
  });

  if (sb) {
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { $('#reset').hidden = false; setTimeout(() => scrollToEl($('#reset')), 400); }
      else if (event === 'SIGNED_OUT' && view === 'owner') route();
    });
  }
  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#reset-pass').value;
    if (pw.length < 8) { $('#err-reset').textContent = 'Your password needs at least 8 characters.'; return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { $('#err-reset').textContent = error.message; return; }
    $('#err-reset').textContent = '';
    $('#reset').hidden = true;
    $('#reset-pass').value = '';
    toast('Password updated ♡');
  });

  /* ==========================================================
     Upload form (owner)
     ========================================================== */
  const form = $('#memory-form');
  const fileInput = $('#file-input');
  const replaceInput = $('#replace-input');
  const dropzone = $('#dropzone');
  const previews = $('#previews');
  const caption = $('#caption');
  const items = [];                // { id, url, blob, w, h, status }
  let replaceId = null;
  let busy = false;
  let lastPublished = null;
  let nextId = 1;

  const setErr = (id, msg, field) => {
    const n = $('#' + id);
    n.textContent = msg || '';
    if (field) { if (msg) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid'); }
  };

  const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      const url = URL.createObjectURL(file);
      try { const img = new Image(); img.src = url; await img.decode(); return img; }
      finally { URL.revokeObjectURL(url); }
    }
  }
  async function processImage(file) {
    if (file.type === 'image/gif') {
      if (file.size > MAX_UPLOAD) throw new Error('That GIF is over 8 MB.');
      const img = await decode(file);
      return { blob: file, w: img.width || img.naturalWidth, h: img.height || img.naturalHeight };
    }
    const src = await decode(file);
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    const s = Math.min(1, MAX_DIM / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    // Re-encoding also strips EXIF data such as GPS location.
    let blob = await toBlob(canvas, 'image/jpeg', 0.86);
    if (blob && blob.size > MAX_UPLOAD) blob = await toBlob(canvas, 'image/jpeg', 0.68);
    if (!blob || blob.size > MAX_UPLOAD) throw new Error('That picture is too large even after shrinking.');
    return { blob, w, h };
  }

  function checkFile(file) {
    if (!ACCEPT.includes(file.type)) return `“${file.name}” isn’t a JPG, PNG, WebP or GIF picture.`;
    if (file.size > MAX_ORIGINAL) return `“${file.name}” is bigger than 25 MB.`;
    return '';
  }

  function renderPreviews() {
    previews.textContent = '';
    items.forEach((it, i) => {
      const li = el('li', 'preview-item');
      const img = new Image();
      img.src = it.url; img.alt = `Preview of picture ${i + 1}`;
      li.append(img);
      if (it.status === 'processing') li.append(el('span', 'pv-status', 'Getting ready…'));
      const acts = el('div', 'pv-actions');
      const rep = el('button', null, 'Replace');
      rep.type = 'button'; rep.dataset.act = 'replace'; rep.dataset.id = it.id;
      rep.setAttribute('aria-label', `Replace picture ${i + 1}`);
      const rem = el('button', null, '✕');
      rem.type = 'button'; rem.dataset.act = 'remove'; rem.dataset.id = it.id;
      rem.setAttribute('aria-label', `Remove picture ${i + 1}`);
      acts.append(rep, rem);
      li.append(acts);
      previews.append(li);
    });
  }

  async function addFiles(fileList) {
    setErr('err-files', '');
    const files = [...fileList];
    const problems = [];
    for (const f of files) {
      if (items.length >= MAX_FILES) { problems.push(`You can add up to ${MAX_FILES} pictures per memory.`); break; }
      const bad = checkFile(f);
      if (bad) { problems.push(bad); continue; }
      const it = { id: String(nextId++), url: URL.createObjectURL(f), blob: null, w: 0, h: 0, status: 'processing' };
      items.push(it);
      renderPreviews();
      try {
        const r = await processImage(f);
        Object.assign(it, r, { status: 'ready' });
      } catch (err) {
        URL.revokeObjectURL(it.url);
        items.splice(items.indexOf(it), 1);
        problems.push(err && err.message && err.message.length < 90 ? err.message : `“${f.name}” couldn’t be read as a picture.`);
      }
      renderPreviews();
    }
    if (problems.length) setErr('err-files', problems.join(' '));
  }

  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (!dropzone.contains(e.target)) e.preventDefault(); }));

  previews.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button[data-act]') : null;
    if (!b || busy) return;
    const it = items.find((x) => x.id === b.dataset.id);
    if (!it) return;
    if (b.dataset.act === 'remove') {
      URL.revokeObjectURL(it.url);
      items.splice(items.indexOf(it), 1);
      renderPreviews();
      setErr('err-files', '');
    } else {
      replaceId = it.id;
      replaceInput.click();
    }
  });
  replaceInput.addEventListener('change', async () => {
    const f = replaceInput.files && replaceInput.files[0];
    replaceInput.value = '';
    const it = items.find((x) => x.id === replaceId);
    if (!f || !it) return;
    const bad = checkFile(f);
    if (bad) { setErr('err-files', bad); return; }
    setErr('err-files', '');
    const oldUrl = it.url;
    it.url = URL.createObjectURL(f); it.status = 'processing'; it.blob = null;
    renderPreviews();
    try {
      Object.assign(it, await processImage(f), { status: 'ready' });
      URL.revokeObjectURL(oldUrl);
    } catch (err) {
      URL.revokeObjectURL(it.url);
      it.url = oldUrl; it.status = 'ready';
      setErr('err-files', err && err.message && err.message.length < 90 ? err.message : 'That picture couldn’t be read.');
    }
    renderPreviews();
  });

  caption.addEventListener('input', () => {
    $('#caption-count').textContent = `${caption.value.length} / 500`;
    if (caption.value.trim()) setErr('err-caption', '', caption);
  });
  const dateInput = $('#memory-date');
  dateInput.max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function validate() {
    let first = null;
    const bad = (node) => { if (!first) first = node; };
    if (!items.length) { setErr('err-files', 'Please add at least one picture.'); bad(fileInput); }
    else if (items.some((i) => i.status !== 'ready')) { setErr('err-files', 'Hang on — your pictures are still getting ready.'); bad(dropzone); }
    if (!caption.value.trim()) { setErr('err-caption', 'Write a little note to go with your memory.', caption); bad(caption); }
    else if (caption.value.length > 500) { setErr('err-caption', 'Your note is a bit long — 500 characters at most.', caption); bad(caption); }
    if (dateInput.value && dateInput.value > dateInput.max) { setErr('err-date', 'That date is in the future.'); dateInput.setAttribute('aria-invalid', 'true'); bad(dateInput); }
    else { setErr('err-date', ''); dateInput.removeAttribute('aria-invalid'); }
    return first;
  }

  function send(fd, tok, onProgress, onUploaded) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', `${SUPABASE_URL}/functions/v1/submit-memory`);
      x.setRequestHeader('Authorization', 'Bearer ' + tok);
      x.setRequestHeader('apikey', KEY);
      x.timeout = 180000;
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.upload.onload = onUploaded;
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText); } catch { /* ignore */ }
        if (x.status >= 200 && x.status < 300 && j.memory) resolve(j.memory);
        else reject(new Error(j.error || 'Something went wrong while saving. Please try again.'));
      };
      x.onerror = () => reject(new Error('Network problem — check your connection and try again.'));
      x.ontimeout = () => reject(new Error('That took too long. Please try again.'));
      x.send(fd);
    });
  }

  function setBusy(on) {
    busy = on;
    $('#submit-btn').disabled = on;
    $('#submit-btn').textContent = on ? 'Publishing…' : 'Publish memory ♡';
    $$('input, textarea, button', form).forEach((n) => { if (n.id !== 'submit-btn' && !n.closest('#success')) n.disabled = on; });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || view !== 'owner') return;
    setErr('err-form', '');
    const tok = await accessToken();
    if (!tok) { setErr('err-form', 'Please log in again to add a memory.'); return; }
    const firstBad = validate();
    if (firstBad) { firstBad.focus(); return; }

    const fd = new FormData();
    items.forEach((it, i) => fd.append('images', it.blob, `photo-${i + 1}.${it.blob.type === 'image/gif' ? 'gif' : 'jpg'}`));
    fd.append('dims', JSON.stringify(items.map((it) => [it.w, it.h])));
    fd.append('caption', caption.value.trim());
    fd.append('display_name', $('#display-name').value.trim());
    fd.append('memory_date', dateInput.value);

    const bar = $('#bar'), label = $('#progress-label');
    bar.classList.remove('indeterminate'); bar.style.width = '0%';
    label.textContent = 'Tucking your memory in…';
    $('#progress').hidden = false;
    setBusy(true);
    try {
      const m = await send(fd, tok,
        (p) => { bar.style.width = Math.round(p * 100) + '%'; label.textContent = `Tucking your memory in… ${Math.round(p * 100)}%`; },
        () => { bar.classList.add('indeterminate'); label.textContent = 'Pinning it to the wall…'; });
      lastPublished = m;
      items.forEach((i) => URL.revokeObjectURL(i.url));
      items.length = 0;
      renderPreviews();
      form.reset();
      $('#caption-count').textContent = '0 / 500';
      addNewMemory(m);
      showSuccess();
    } catch (err) {
      setErr('err-form', err.message);
    } finally {
      setBusy(false);
      $('#progress').hidden = true;
    }
  });

  function showSuccess() {
    const s = $('#success');
    s.hidden = false;
    $('#success-sub').textContent = theme() === 'spider' ? 'MEMORY SAVED! It’s on your wall now.' : 'It’s on your wall now. Send your wall link to share it ♡';
    $('#success-see').focus({ preventScroll: true });
    const r = s.getBoundingClientRect();
    celebrate(r.left + r.width / 2, r.top + Math.min(r.height / 2, innerHeight / 2));
  }
  $('#success-again').addEventListener('click', () => { $('#success').hidden = true; fileInput.focus(); });
  $('#success-see').addEventListener('click', () => { $('#success').hidden = true; scrollToEl($('#wall')); });
  $('#success-copy').addEventListener('click', async () => toast((await copyText(shareUrl())) ? 'Wall link copied ♡' : 'Couldn’t copy the link'));

  /* ==========================================================
     Floating objects you can tap
     ========================================================== */
  const FLOATERS = {
    pink: {
      items: [['heart', '#D94B70'], ['bow', '#B78BA2'], ['sparkle', '#D94B70'], ['heart', '#F4BFD3'], ['bow', '#D94B70'], ['sparkle', '#B78BA2']],
      say: ['You are loved ♡', 'Tiny moments, big feelings', 'Sending you sparkles ✧', 'Bow-tiful memory!', 'Cuteness overload ♡', 'Hello, sunshine ♡'],
    },
    garden: {
      items: [['butterfly', '#B7C9A8'], ['petal', '#F2C94C'], ['mushroom', '#C0504D'], ['butterfly', '#F2E5A7'], ['petal', '#ffffff'], ['mushroom', '#B7794A']],
      say: ['A little butterfly says hi ✿', 'Bloom where you are planted', 'Mushroom magic!', 'Petals for your thoughts', 'Peaceful moments grow here', 'Something lovely is growing ❦'],
    },
    spider: {
      items: [['burst', '#E63946', 'POW!'], ['web', '#ffffff'], ['spider', '#E63946'], ['burst', '#3B82F6', 'ZAP!'], ['web', '#8fb8ff'], ['spider', '#ffffff']],
      say: ['THWIP!', 'Swinging by!', 'Nice snap!', 'Web-tastic memory!', 'Comic-book moment!', 'Look at that panel!'],
    },
  };

  function showSay(x, y, text) {
    const b = el('span', 'say', text);
    b.style.left = Math.min(Math.max(x, 100), innerWidth - 100) + 'px';
    b.style.top = Math.max(y - 44, 24) + 'px';
    document.body.append(b);
    setTimeout(() => b.remove(), 2500);
  }

  function buildFloaters(name) {
    const box = $('#floaters');
    if (!box || !FLOATERS[name]) return;
    box.textContent = '';
    const cfg = FLOATERS[name];
    const n = innerWidth < 640 ? 4 : 6;
    cfg.items.slice(0, n).forEach(([icon, color, word], i) => {
      const f = el('span', 'floater');
      const rv = (a, b2, unit) => R(a, b2).toFixed(1) + unit;
      f.style.cssText = [
        `--c:${color}`, `--s:${Math.round(R(42, 56))}px`, `--d:${R(28, 48).toFixed(1)}s`, `--dl:${(-R(0, 30)).toFixed(1)}s`,
        `left:${rv(3, 88, '%')}`, `top:${rv(14, 84, '%')}`,
        `--x1:${rv(-22, 22, 'vw')}`, `--y1:${rv(-18, 18, 'vh')}`, `--x2:${rv(-22, 22, 'vw')}`, `--y2:${rv(-18, 18, 'vh')}`,
        `--x3:${rv(-22, 22, 'vw')}`, `--y3:${rv(-18, 18, 'vh')}`,
      ].join(';');
      f.innerHTML = `<svg aria-hidden="true"><use href="#i-${icon}"/></svg>` + (word ? `<b>${word}</b>` : '');
      f.addEventListener('click', () => {
        const r = f.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        f.classList.remove('popped'); void f.offsetWidth; f.classList.add('popped');
        if (!reduced.matches) burstAt(x, y, 10, 70, 'burst');
        showSay(x, y, pick(cfg.say));
      });
      box.append(f);
    });
  }

  /* ==========================================================
     Save a memory as a scrapbook card (PNG)
     ========================================================== */
  const GLYPH = {
    heart: ['M24 42C10 31 4 23 4 15a10 10 0 0 1 20-3 10 10 0 0 1 20 3c0 8-6 16-20 27z', 48],
    sparkle: ['M24 2c1.8 10 4.6 18.2 22 22-17.4 3.8-20.2 12-22 22-1.8-10-4.6-18.2-22-22C19.4 20.2 22.2 12 24 2z', 48],
    leaf: ['M8 40C6 20 18 6 42 6c0 24-12 36-30 34z', 48],
    petal: ['M24 4c10 8 14 18 0 40C10 22 14 12 24 4z', 48],
    bow: ['M24 24C14 12 4 10 4 20s10 14 20 4zM24 24c10-12 20-14 20-4s-10 14-20 4zM22 28l-7 15 9-6zM26 28l7 15-9-6z', 48],
    burst: ['M98 50L79 57.8 91.6 74 71.2 71.2 74 91.6 57.8 79 50 98 42.2 79 26 91.6 28.8 71.2 8.4 74 21 57.8 2 50 21 42.2 8.4 26 28.8 28.8 26 8.4 42.2 21 50 2 57.8 21 74 8.4 71.2 28.8 91.6 26 79 42.2z', 100],
  };
  const glyphCache = {};
  function glyph(ctx, name, x, y, size, color, rot = 0) {
    const [d, vb] = GLYPH[name];
    const p = glyphCache[name] || (glyphCache[name] = new Path2D(d));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    const s = size / vb;
    ctx.scale(s, s); ctx.translate(-vb / 2, -vb / 2);
    ctx.fillStyle = color; ctx.fill(p);
    ctx.restore();
  }
  function daisy(ctx, x, y, size, petal, center) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = petal;
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, -size * 0.3, size * 0.1, size * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = center;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function web(ctx, size) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let a = 0; a <= 4; a++) { const t = (a / 4) * (Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * size, Math.sin(t) * size); ctx.stroke(); }
    for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.arc(0, 0, (r / 4) * size, 0, Math.PI / 2); ctx.stroke(); }
    ctx.restore();
  }
  function rng(seed) { let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function wrapLines(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (ctx.measureText(w).width > maxW) {      // break extremely long words
          let n = w.length;
          while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, n)); w = w.slice(n);
        }
        const t = line ? line + ' ' + w : w;
        if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  async function makeCardImage(m, imgIndex) {
    const t = theme();
    const image = m.images[imgIndex] || m.images[0];
    const res = await fetch(image.url, { mode: 'cors' });
    if (!res.ok) throw new Error('image');
    const bmp = await createImageBitmap(await res.blob());
    const F = {
      pink: { cap: '700 58px "Caveat", cursive', meta: '700 30px "Nunito", sans-serif', brand: '700 44px "Dancing Script", cursive', ink: '#4a2a3a', soft: '#7a5468', accent: '#D94B70', lh: 66, rad: 8 },
      garden: { cap: 'italic 700 50px "Cormorant Garamond", Georgia, serif', meta: '700 30px "Nunito", sans-serif', brand: 'italic 700 42px "Cormorant Garamond", Georgia, serif', ink: '#2a3d2e', soft: '#55705a', accent: '#344D38', lh: 60, rad: 26 },
      spider: { cap: '700 38px "Comic Neue", "Comic Sans MS", sans-serif', meta: '700 27px "Comic Neue", "Comic Sans MS", sans-serif', brand: '400 46px "Bangers", Impact, sans-serif', ink: '#191919', soft: '#4a4f63', accent: '#E63946', lh: 48, rad: 0 },
    }[t];
    try { await Promise.all([F.cap, F.meta, F.brand].map((f) => document.fonts.load(f, 'Aa♡'))); } catch { /* fall back to default fonts */ }

    const W = 1080, M = 90, PW = W - 2 * M, IN = 36, IW = PW - 2 * IN;
    const photoH = Math.round(Math.min(1100, Math.max(560, IW / (bmp.width / bmp.height))));
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = F.cap;
    const lines = wrapLines(measure, m.caption, IW - 20);
    const panelX = M, panelY = M + 24;
    const photoY = panelY + IN;
    const capY = photoY + photoH + 34;
    const metaY = capY + lines.length * F.lh + 24 + 28;
    const brandY = metaY + 64;
    const panelH = brandY + IN - panelY;
    const H = panelY + panelH + M;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const rand = rng(hash(m.id));

    // --- background ---
    if (t === 'pink') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#FFF8F0'); g.addColorStop(0.5, '#F8DCE8'); g.addColorStop(1, '#F4BFD3');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 34; i++) glyph(ctx, i % 3 ? 'heart' : 'sparkle', rand() * W, rand() * H, 16 + rand() * 34, ['#F4BFD3', '#D94B70', '#ffffff', '#B78BA2'][i % 4], rand() * 1.2 - 0.6);
      ctx.globalAlpha = 1;
    } else if (t === 'garden') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#FFF8E9'); g.addColorStop(1, '#B7C9A8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 30; i++) glyph(ctx, i % 2 ? 'leaf' : 'petal', rand() * W, rand() * H, 24 + rand() * 40, ['#748B67', '#B7C9A8', '#F2E5A7', '#ffffff'][i % 4], rand() * 6.28);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#101A36'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W, 0, 0, W, 0, W);
      g.addColorStop(0, 'rgba(59,130,246,.45)'); g.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) {
        ctx.fillStyle = `rgba(230,57,70,${Math.max(0, 0.5 - y / H * 0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, 4.5 * (1 - y / H * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.save(); web(ctx, 300); ctx.restore();
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); web(ctx, 300); ctx.restore();
    }

    // --- panel (the card itself) ---
    ctx.save();
    if (t === 'pink') { ctx.translate(W / 2, H / 2); ctx.rotate(-0.014); ctx.translate(-W / 2, -H / 2); }
    if (t === 'pink') {
      ctx.shadowColor = 'rgba(183,139,162,.6)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 18;
      rr(ctx, panelX, panelY, PW, panelH, 10); ctx.fillStyle = '#FFF8F0'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save(); ctx.translate(W / 2, panelY); ctx.rotate(-0.05);
      ctx.fillStyle = 'rgba(244,191,211,.92)'; ctx.fillRect(-120, -30, 240, 60);
      ctx.fillStyle = 'rgba(255,248,240,.55)';
      for (let x = -120; x < 120; x += 36) { ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x + 18, -30); ctx.lineTo(x - 2, 30); ctx.lineTo(x - 20, 30); ctx.fill(); }
      ctx.restore();
    } else if (t === 'garden') {
      ctx.shadowColor = 'rgba(52,77,56,.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
      rr(ctx, panelX, panelY, PW, panelH, 44); ctx.fillStyle = '#FFF8E9'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 4; ctx.strokeStyle = '#748B67'; ctx.stroke();
      ctx.setLineDash([10, 9]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(116,139,103,.7)';
      rr(ctx, panelX + 14, panelY + 14, PW - 28, panelH - 28, 32); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = '#E63946'; ctx.fillRect(panelX + 18, panelY + 18, PW, panelH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(panelX, panelY, PW, panelH);
      ctx.lineWidth = 8; ctx.strokeStyle = '#191919'; ctx.strokeRect(panelX, panelY, PW, panelH);
    }

    // photo (cover-fit)
    const sc = Math.max(IW / bmp.width, photoH / bmp.height);
    const sw = IW / sc, sh = photoH / sc;
    ctx.save();
    rr(ctx, panelX + IN, photoY, IW, photoH, F.rad); ctx.clip();
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, panelX + IN, photoY, IW, photoH);
    ctx.restore();
    if (t === 'spider') { ctx.lineWidth = 6; ctx.strokeStyle = '#191919'; ctx.strokeRect(panelX + IN, photoY, IW, photoH); }

    // note, date, brand
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = F.ink; ctx.font = F.cap;
    lines.forEach((l, i) => ctx.fillText(l, panelX + IN + 10, capY + F.lh * 0.8 + i * F.lh));
    ctx.fillStyle = F.soft; ctx.font = F.meta;
    ctx.fillText(t === 'spider' ? metaText(m).toUpperCase() : metaText(m), panelX + IN + 10, metaY);
    ctx.fillStyle = F.accent; ctx.font = F.brand; ctx.textAlign = 'right';
    ctx.fillText(t === 'spider' ? 'LITTLE MEMORIES CLUB' : 'Little Memories Club ♡', panelX + PW - IN - 10, brandY);
    ctx.restore();

    // --- decorations on top ---
    if (t === 'pink') {
      glyph(ctx, 'bow', M + 20, panelY + 20, 170, '#D94B70', -0.35);
      glyph(ctx, 'heart', W - M + 40, H - M + 2, 100, '#D94B70', 0.25);
      glyph(ctx, 'sparkle', W - M + 5, panelY + 70, 70, '#ffffff', 0.3);
      glyph(ctx, 'sparkle', M - 5, H - M - 60, 58, '#D94B70', 0);
    } else if (t === 'garden') {
      glyph(ctx, 'leaf', M - 4, panelY + 10, 170, '#748B67', -0.5);
      daisy(ctx, W - M + 8, panelY + 24, 170, '#ffffff', '#F2C94C');
      daisy(ctx, M + 10, H - M + 4, 130, '#ffffff', '#F2C94C');
      glyph(ctx, 'leaf', W - M - 4, H - M + 4, 150, '#344D38', 2.6);
    } else {
      const bx = W - M - 90, by = panelY + 46;
      glyph(ctx, 'burst', bx + 8, by + 8, 270, '#191919', 0.2);
      glyph(ctx, 'burst', bx, by, 270, '#E63946', 0.2);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(0.2);
      ctx.textAlign = 'center'; ctx.font = '400 46px "Bangers", Impact, sans-serif';
      ctx.fillStyle = '#191919'; ctx.fillText('MEMORY', 3, -2); ctx.fillText('SAVED!', 3, 50);
      ctx.fillStyle = '#ffffff'; ctx.fillText('MEMORY', 0, -5); ctx.fillText('SAVED!', 0, 47);
      ctx.restore();
    }
    if (bmp.close) bmp.close();
    return await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }

  $('#lb-card').addEventListener('click', async () => {
    const m = memories[lbState.index];
    if (!m) return;
    const btn = $('#lb-card');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Making your card…';
    try {
      const blob = await makeCardImage(m, lbState.img);
      if (!blob) throw new Error('blob');
      const name = `little-memory-${m.id.slice(0, 8)}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const touch = matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'A little memory ♡' }); }
        catch (e) { if (e && e.name !== 'AbortError') throw e; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = el('a');
        a.href = url; a.download = name;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('Card saved ♡');
      }
    } catch (err) {
      console.error(err);
      toast('Couldn’t make the card — please try again.');
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  /* ==========================================================
     Footer, init
     ========================================================== */
  $('#to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }));
  $$('.reveal').forEach(observe);

  function init() {
    syncRadios(theme());
    buildDecor(theme());
    setAuthMode('login');
    if (!configured || !sb) {
      $('#setup-msg').textContent = !configured
        ? 'This site isn’t connected to Supabase yet. Follow the setup steps in the README, then set SUPABASE_URL and SUPABASE_ANON_KEY and rebuild.'
        : 'The sign-in library couldn’t load. Check your internet connection and refresh the page.';
      $('#setup-notice').hidden = false;
      setView(WALL_ROUTE.test(location.pathname) ? 'viewer' : 'landing');
      $('#loading').hidden = true;
      return;
    }
    route();
  }
  init();
})();
