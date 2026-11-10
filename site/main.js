(() => {
  'use strict';

  const REPO = 'LuciferSharma/focus';
  const API = `https://api.github.com/repos/${REPO}`;
  const CACHE_MS = 60 * 60 * 1000; // GitHub allows 60 unauthenticated requests/hour per visitor
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ═════════ GitHub: stars + commits ═════════ */
  async function cachedJson(url, key) {
    try {
      const hit = JSON.parse(localStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
    } catch {}
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const v = await res.json();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
    return v;
  }
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  cachedJson(API, 'fw_repo')
    .then((r) => $$('[data-stars]').forEach((el) => (el.textContent = fmt(Number(r.stargazers_count) || 0))))
    .catch(() => $$('[data-stars]').forEach((el) => (el.textContent = '★')));

  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    for (const [u, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      const v = Math.floor(s / sec);
      if (v >= 1) return `${v} ${u}${v > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  };
  const commitsEl = $('[data-commits]');
  if (commitsEl) {
    cachedJson(`${API}/commits?per_page=5`, 'fw_commits')
      .then((list) => {
        if (!Array.isArray(list) || !list.length) throw new Error('empty');
        commitsEl.innerHTML = list.map((c) => {
          const msg = (c.commit?.message || '').split('\n')[0];
          const date = c.commit?.author?.date;
          return `<li><a href="${esc(c.html_url)}" target="_blank" rel="noopener"><span class="commit-msg">${esc(msg)}</span><span class="commit-meta">${esc(c.sha.slice(0, 7))} · ${date ? esc(ago(date)) : ''}</span></a></li>`;
        }).join('');
      })
      .catch(() => {
        commitsEl.innerHTML = `<li class="commit-loading mono">Couldn't reach GitHub. <a href="https://github.com/${REPO}/commits/main" target="_blank" rel="noopener">See commits →</a></li>`;
      });
  }

  /* ═════════ marquee: duplicate the row for a seamless loop ═════════ */
  const mrow = $('[data-marquee]');
  if (mrow) { const c = mrow.cloneNode(true); c.setAttribute('aria-hidden', 'true'); mrow.after(c); }

  /* ═════════ split headings into words ═════════ */
  $$('.split').forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
            const w = document.createElement('span');
            w.className = 'w';
            w.innerHTML = `<span style="--i:${i++}">${esc(part)}</span>`;
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  });

  /* ═════════ hero rotator: "Not now, ___." ═════════ */
  const rot = $('[data-rotator]');
  if (rot) {
    const word = $('.rot-word', rot);
    const strike = $('.rot-strike', rot);
    const words = ['YouTube', 'Instagram', 'Reddit', 'TikTok', 'Twitter', 'Netflix'];
    const measure = document.createElement('span');
    measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit;font-style:italic;';
    rot.appendChild(measure);
    const widthOf = (w) => { measure.textContent = w; return measure.getBoundingClientRect().width; };
    let idx = 0;
    const setWidth = (w) => (rot.style.width = `${widthOf(w)}px`);
    setWidth(words[0]);
    // re-measure once the web font has loaded (the fallback font is wider)
    document.fonts?.ready.then(() => setWidth(words[idx]));
    window.addEventListener('resize', () => setWidth(words[idx]));
    {
      (async function loop() {
        await sleep(1400);
        for (;;) {
          strike.classList.remove('off');
          strike.classList.add('on');
          word.classList.add('struck');
          await sleep(900);
          word.classList.add('leave');
          strike.classList.add('off');
          await sleep(380);
          idx = (idx + 1) % words.length;
          strike.classList.remove('on');
          word.classList.remove('leave', 'struck');
          word.classList.add('enter');
          word.textContent = words[idx];
          setWidth(words[idx]);
          void word.offsetWidth;
          word.classList.remove('enter');
          await sleep(1500);
        }
      })();
    }
  }

  /* ═════════ hero app: timer + blocked attempts loop ═════════ */
  const timerEl = $('[data-timer]');
  const ring = $('[data-ring]');
  const TOTAL = 45 * 60;
  const CIRC = 2 * Math.PI * 88;
  let remaining = TOTAL - 1;
  if (ring) ring.style.strokeDasharray = String(CIRC);
  const paintTimer = () => {
    if (timerEl) timerEl.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if (ring) ring.style.strokeDashoffset = String(CIRC * (1 - remaining / TOTAL));
  };
  paintTimer();
  setInterval(() => { remaining = remaining <= 0 ? TOTAL : remaining - 1; paintTimer(); }, 1000);

  const heroSites = $$('[data-hero-sites] li');
  const heroAttempts = $('[data-hero-attempts]');
  const toast = $('[data-toast]');
  const toastText = $('[data-toast-text]');
  let heroCount = 0;
  if (heroSites.length) {
    const order = [0, 1, 4, 2, 3, 0, 1];
    let k = 0;
    setInterval(() => {
      const li = heroSites[order[k++ % order.length]];
      const host = li.dataset.host;
      const allowed = li.classList.contains('is-allowed');
      li.classList.remove('hit', 'pass');
      void li.offsetWidth;
      li.classList.add(allowed ? 'pass' : 'hit');
      setTimeout(() => li.classList.remove('hit', 'pass'), 1500);
      if (!allowed) {
        heroCount++;
        heroAttempts.textContent = String(heroCount);
        heroAttempts.classList.remove('bump'); void heroAttempts.offsetWidth; heroAttempts.classList.add('bump');
      }
      toast.classList.toggle('ok', allowed);
      $('.toast-icon', toast).textContent = allowed ? '🎵' : '🛑';
      toastText.textContent = allowed ? `${host} allowed: music keeps playing` : `Blocked ${host} · attempt #${heroCount}`;
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('show'), 1600);
    }, 2200);
  }

  /* ═════════ story scenes ═════════ */
  const scenes = $$('[data-scene]');
  const beats = $$('[data-beats] li');
  const typer = $('[data-typer]');
  const scoreEl = $('[data-score]');
  const confetti = $('[data-confetti]');
  let typeRun = 0;

  async function typeTask() {
    const run = ++typeRun;
    const text = 'Write the report intro';
    typer.textContent = '';
    await sleep(350);
    for (let i = 1; i <= text.length; i++) {
      if (run !== typeRun) return;
      typer.textContent = text.slice(0, i);
      await sleep(45 + Math.random() * 40);
    }
  }
  function countScore() {
    const start = performance.now();
    const step = (t) => {
      const p = clamp((t - start) / 1400, 0, 1);
      scoreEl.textContent = String(Math.round(87 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function aimCursor(scene) {
    const yes = $('.ans-yes', scene);
    const sr = scene.getBoundingClientRect();
    const yr = yes.getBoundingClientRect();
    const cx = ((yr.left + yr.width * 0.55 - sr.left) / sr.width) * 100;
    const cy = ((yr.top + yr.height * 0.55 - sr.top) / sr.height) * 100;
    scene.style.setProperty('--cx', `${cx}%`);
    scene.style.setProperty('--cy', `${cy}%`);
    const colors = ['#34d399', '#fbbf24', '#22d3ee', '#fb7185', '#eeebe4'];
    confetti.innerHTML = Array.from({ length: 26 }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 140;
      return `<i style="--ox:${cx}%;--oy:${cy}%;--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720 - 360}deg;--c:${colors[Math.floor(Math.random() * colors.length)]}"></i>`;
    }).join('');
  }
  function activateScene(scene, on) {
    if (on) {
      // restart CSS animations
      scene.classList.remove('is-on'); void scene.offsetWidth; scene.classList.add('is-on');
      const n = Number(scene.dataset.scene);
      if (n === 0) typeTask();
      if (n === 2) aimCursor(scene);
      if (n === 3) countScore();
    } else {
      scene.classList.remove('is-on');
    }
  }

  const story = $('[data-story]');
  const storyBar = $('[data-story-bar]');
  const pinned = () => window.matchMedia('(min-width: 1021px)').matches;
  let currentBeat = -1;

  function setBeat(n) {
    if (n === currentBeat) return;
    currentBeat = n;
    scenes.forEach((s, i) => activateScene(s, i === n));
    beats.forEach((b, i) => { b.classList.toggle('is-on', i === n); b.classList.toggle('is-done', i < n); });
  }

  // mobile: animate each scene when it scrolls into view
  if ('IntersectionObserver' in window) {
    const sceneIO = new IntersectionObserver((entries) => {
      if (pinned()) return;
      entries.forEach((e) => { if (e.isIntersecting) activateScene(e.target, true); });
    }, { threshold: 0.45 });
    scenes.forEach((s) => sceneIO.observe(s));
  }

  /* ═════════ "why" quote: words light up with scroll ═════════ */
  const quote = $('[data-words]');
  let words = [];
  if (quote) {
    const highlight = new Set(['anything', 'done.']);
    quote.innerHTML = quote.textContent.trim().split(/\s+/).map((w) => `<span class="word${highlight.has(w) ? ' hl' : ''}">${esc(w)}</span>`).join(' ');
    words = $$('.word', quote);
  }

  /* ═════════ scroll loop ═════════ */
  const progressBar = $('[data-progress]');
  const nav = $('.nav');
  const app = $('[data-tilt]');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    progressBar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('is-scrolled', y > 20);

    if (app && !reduced) {
      const r = app.getBoundingClientRect();
      const t = clamp((r.top - vh * 0.15) / (vh * 0.6), 0, 1);
      app.style.setProperty('--tilt', t.toFixed(3));
    }

    if (story && pinned()) {
      const r = story.getBoundingClientRect();
      const total = story.offsetHeight - vh;
      const p = clamp(-r.top / total, 0, 1);
      storyBar.style.transform = `scaleX(${p})`;
      // not reached yet: reset, so the first beat plays when it scrolls into view
      setBeat(r.top > vh * 0.6 ? -1 : Math.min(3, Math.floor(p * 4)));
    }

    if (words.length) {
      const r = quote.getBoundingClientRect();
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
      const lit = Math.round(p * words.length * 1.15);
      words.forEach((w, i) => w.classList.toggle('lit', i < lit));
    }
  }
  const requestScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
  window.addEventListener('scroll', requestScroll, { passive: true });
  window.addEventListener('resize', requestScroll);
  onScroll();
  if (!pinned()) setBeat(-1);

  /* ═════════ interactive browser demo ═════════ */
  const BLOCKED = ['youtube.com', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'linkedin.com', 'tiktok.com', 'netflix.com'];
  const ALLOWED = ['music.youtube.com', 'studio.youtube.com'];
  const matches = (h, d) => h === d || h.endsWith(`.${d}`);
  const viewport = $('[data-viewport]');
  const address = $('[data-address]');
  const browser = $('[data-browser]');
  let attempts = 0;
  let typing = null;
  const normalizeHost = (raw) => {
    let s = String(raw || '').trim().toLowerCase();
    if (!s) return '';
    if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
    try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return ''; }
  };
  const render = (html) => (viewport.innerHTML = html);
  const showResult = (host) => {
    if (ALLOWED.some((d) => matches(host, d))) {
      const music = host.startsWith('music.');
      render(`<div class="allowed"><span class="allowed-badge">✓ Allowed exception</span><h3>${music ? 'The music plays on.' : 'Studio stays open.'}</h3><p>${esc(host)} is never blocked.</p>${music ? '<div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}</div>`);
      return;
    }
    if (BLOCKED.some((d) => matches(host, d))) {
      attempts++;
      browser.classList.remove('jolt'); void browser.offsetWidth; browser.classList.add('jolt');
      render(`<div class="blocked" role="alert">
        <div class="blocked-head"><div><span class="blocked-tag">Blocked during focus</span><h3>${esc(host)}</h3></div>
        <div class="blocked-count"><span>ATTEMPT</span><b>#${attempts}</b></div></div>
        <div class="blocked-goal"><span>You're working on</span><p>Write the report intro</p></div>
        <div class="blocked-actions"><button type="button" class="b-back" data-back>← Back to work</button>
        <button type="button" class="b-unlock" data-unlock>I really need it</button></div></div>`);
      return;
    }
    render(`<div class="allowed"><span class="allowed-badge">✓ Not on your list</span><h3>Opens normally.</h3><p>FocusWatch stays out of the way.</p><div class="doc-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>`);
  };
  const visit = (raw) => {
    const host = normalizeHost(raw);
    if (!host) return;
    $$('[data-site]').forEach((b) => b.classList.toggle('is-active', b.dataset.site === host));
    clearInterval(typing);
    let i = 0;
    address.value = '';
    render(`<p class="vp-loading">Loading ${esc(host)} </p>`);
    typing = setInterval(() => {
      address.value = host.slice(0, ++i);
      if (i >= host.length) { clearInterval(typing); setTimeout(() => showResult(host), 260); }
    }, 26);
  };
  $$('[data-site]').forEach((b) => b.addEventListener('click', () => visit(b.dataset.site)));
  $('[data-address-form]')?.addEventListener('submit', (e) => { e.preventDefault(); visit(address.value); });
  viewport?.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) {
      address.value = 'docs.google.com';
      $$('[data-site]').forEach((b) => b.classList.remove('is-active'));
      render(`<div class="allowed"><span class="allowed-badge">↩ Back to work</span><h3>Good call.</h3><p>Attempt #${attempts} logged in today's stats.</p><div class="doc-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>`);
    } else if (e.target.closest('[data-unlock]')) {
      e.target.closest('[data-unlock]').textContent = 'Type why + wait 15s → 5–15 minutes';
    }
  });

  /* ═════════ feature tile animations ═════════ */
  const heat = $('[data-heat]');
  if (heat) {
    heat.innerHTML = Array.from({ length: 48 }, () => '<i></i>').join('');
    const cells = $$('i', heat);
    const shuffle = () => cells.forEach((c) => {
      const r = Math.random();
      c.dataset.l = r > 0.86 ? '3' : r > 0.66 ? '2' : r > 0.4 ? '1' : '0';
    });
    shuffle();
    setInterval(shuffle, 1800);
  }

  const keysViz = $('[data-keys]');
  if (keysViz) {
    const combos = [[['Alt', 'S'], 'Stash all tabs'], [['Alt', '⇧', 'C'], 'Capture proof'], [['Alt', 'N'], 'Open notes']];
    const row = $('.keyrow', keysViz);
    const label = $('.key-label', keysViz);
    let c = 0;
    setInterval(async () => {
      c = (c + 1) % combos.length;
      const [keys, text] = combos[c];
      row.innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('');
      label.textContent = text;
      const kbds = $$('kbd', row);
      for (const k of kbds) { await sleep(140); k.classList.add('down'); }
      await sleep(500);
      kbds.forEach((k) => k.classList.remove('down'));
    }, 2400);
  }

  const aiBtn = $('[data-ai-btn]');
  if (aiBtn) {
    setInterval(() => {
      aiBtn.classList.add('done'); aiBtn.textContent = 'Copied ✓';
      setTimeout(() => { aiBtn.classList.remove('done'); aiBtn.textContent = 'Copy summary'; }, 1300);
    }, 3200);
  }

  /* ═════════ counters ═════════ */
  const counters = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const el = e.target;
        const to = Number(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const t0 = performance.now();
        const step = (t) => {
          const p = clamp((t - t0) / 1300, 0, 1);
          el.textContent = `${Math.round(to * (1 - Math.pow(1 - p, 3)))}${suffix}`;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  }

  /* ═════════ reveal on scroll ═════════ */
  if ('IntersectionObserver' in window) {
    const revealTargets = $$('.tile, .browser, .video-frame, .ms, .commits, .install-card, .stats > div, .principles span, .faq details, .cta');
    revealTargets.forEach((el, i) => { el.classList.add('reveal-up'); el.style.transitionDelay = `${(i % 4) * 80}ms`; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
        setTimeout(() => (e.target.style.transitionDelay = ''), 1200);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    revealTargets.forEach((el) => io.observe(el));

    const splitIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); splitIO.unobserve(e.target); } });
    }, { threshold: 0.3 });
    $$('.split').forEach((el) => splitIO.observe(el));
  } else {
    $$('.split').forEach((el) => el.classList.add('is-in'));
  }

  /* ═════════ pointer effects: spotlight, magnetic, parallax ═════════ */
  if (finePointer && !reduced) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest?.('.spot');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    }, { passive: true });

    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s';
        el.style.transform = '';
        setTimeout(() => (el.style.transition = ''), 500);
      });
    });

    const stage = $('[data-stage]');
    const chips = $$('.float-chip');
    stage?.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      chips.forEach((c, i) => {
        const f = (i + 1) * 14;
        c.style.setProperty('--px', (dx * f).toFixed(1));
        c.style.setProperty('--py', (dy * f).toFixed(1));
      });
    });
  }

  /* ═════════ video slot ═════════ */
  const frame = $('.video-frame');
  const src = frame?.dataset.video?.trim();
  if (frame && src) {
    const yt = src.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    frame.innerHTML = yt
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" title="FocusWatch walkthrough" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
      : `<video src="${esc(src)}" controls playsinline preload="metadata"></video>`;
  }

  /* ═════════ install tabs (with sliding glider) ═════════ */
  const tabs = $$('[role="tab"]');
  const glider = $('.tab-glider');
  const moveGlider = (t) => {
    if (!glider || !t) return;
    glider.style.width = `${t.offsetWidth}px`;
    glider.style.transform = `translateX(${t.offsetLeft}px)`;
  };
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.dataset.tab).hidden = !on;
    });
    moveGlider(tab);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus();
    });
  });
  const syncGlider = () => moveGlider(tabs.find((t) => t.getAttribute('aria-selected') === 'true'));
  syncGlider();
  document.fonts?.ready.then(syncGlider);
  window.addEventListener('resize', syncGlider);

  /* ═════════ copy buttons ═════════ */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = $(btn.dataset.copy)?.textContent || '';
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      const label = btn.textContent;
      btn.textContent = 'Copied ✓'; btn.classList.add('is-copied');
      setTimeout(() => { btn.textContent = label; btn.classList.remove('is-copied'); }, 1800);
    });
  });
})();
