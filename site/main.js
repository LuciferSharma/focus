(() => {
  'use strict';

  const REPO = 'LuciferSharma/focus';
  const API = `https://api.github.com/repos/${REPO}`;
  const CACHE_MS = 60 * 60 * 1000; // GitHub allows 60 unauthenticated requests/hour per visitor

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ───────── cached GitHub fetch ───────── */
  async function cachedJson(url, key) {
    try {
      const hit = JSON.parse(localStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
    } catch {}
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const v = await res.json();
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
    } catch {}
    return v;
  }

  /* ───────── stars ───────── */
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  cachedJson(API, 'fw_repo')
    .then((repo) => {
      const n = Number(repo.stargazers_count) || 0;
      $$('[data-stars]').forEach((el) => (el.textContent = fmt(n)));
    })
    .catch(() => $$('[data-stars]').forEach((el) => (el.textContent = '★')));

  /* ───────── latest commits ───────── */
  const commitsEl = $('[data-commits]');
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [u, sec] of units) {
      const v = Math.floor(s / sec);
      if (v >= 1) return `${v} ${u}${v > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  };
  if (commitsEl) {
    cachedJson(`${API}/commits?per_page=5`, 'fw_commits')
      .then((list) => {
        if (!Array.isArray(list) || !list.length) throw new Error('empty');
        commitsEl.innerHTML = list
          .map((c) => {
            const msg = (c.commit?.message || '').split('\n')[0];
            const date = c.commit?.author?.date;
            return `<li><a href="${esc(c.html_url)}" target="_blank" rel="noopener">
              <span class="commit-msg">${esc(msg)}</span>
              <span class="commit-meta">${esc(c.sha.slice(0, 7))} · ${date ? esc(ago(date)) : ''}</span>
            </a></li>`;
          })
          .join('');
      })
      .catch(() => {
        commitsEl.innerHTML = `<li class="commit-loading mono">Couldn't reach GitHub. <a href="https://github.com/${REPO}/commits/main" target="_blank" rel="noopener">See commits →</a></li>`;
      });
  }

  /* ───────── HUD countdown (45 minutes, loops) ───────── */
  const timerEl = $('[data-timer]');
  const ring = $('.ring-progress');
  const TOTAL = 45 * 60;
  const CIRC = 2 * Math.PI * 88;
  let remaining = TOTAL - 1;
  if (ring) ring.style.strokeDasharray = String(CIRC);
  const paint = () => {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (ring) ring.style.strokeDashoffset = String(CIRC * (1 - remaining / TOTAL));
  };
  paint();
  setInterval(() => {
    remaining = remaining <= 0 ? TOTAL : remaining - 1;
    paint();
  }, 1000);

  /* ───────── interactive browser demo ───────── */
  const BLOCKED = ['youtube.com', 'instagram.com', 'reddit.com', 'x.com', 'facebook.com', 'linkedin.com'];
  const ALLOWED = ['music.youtube.com', 'studio.youtube.com'];
  const TASK = 'Write the quarterly report intro';
  const matches = (host, d) => host === d || host.endsWith(`.${d}`);
  const viewport = $('[data-viewport]');
  const address = $('[data-address]');
  const attemptsEls = $$('[data-attempts]');
  let attempts = 0;
  let typing = null;

  const normalizeHost = (raw) => {
    let s = String(raw || '').trim().toLowerCase();
    if (!s) return '';
    if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
    try {
      return new URL(s).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const bumpAttempts = () => {
    attempts += 1;
    attemptsEls.forEach((el) => {
      el.textContent = String(attempts);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  };

  const render = (html) => {
    viewport.innerHTML = html;
  };

  const showResult = (host) => {
    if (ALLOWED.some((d) => matches(host, d))) {
      const isMusic = host.startsWith('music.');
      render(`<div class="allowed">
        <span class="allowed-badge">✓ Allowed exception</span>
        <h3>${isMusic ? 'Your playlist keeps playing.' : 'Studio stays open.'}</h3>
        <p>${esc(host)} is on the allow list, so it isn't blocked even during a session.</p>
        ${isMusic ? '<div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}
      </div>`);
      return;
    }
    if (BLOCKED.some((d) => matches(host, d))) {
      bumpAttempts();
      render(`<div class="blocked" role="alert">
        <div class="blocked-head">
          <div>
            <span class="blocked-tag">Blocked during focus</span>
            <h3>${esc(host)}</h3>
          </div>
          <div class="blocked-count"><span>ATTEMPTS</span><b>#${attempts}</b></div>
        </div>
        <div class="blocked-goal">
          <span>You're working on</span>
          <p>${esc(TASK)}</p>
        </div>
        <div class="blocked-actions">
          <button type="button" class="b-back" data-back>← Back to work</button>
          <button type="button" class="b-unlock" data-unlock>I really need it (type a reason, then wait 15s)</button>
        </div>
      </div>`);
      return;
    }
    render(`<div class="allowed">
      <span class="allowed-badge">✓ Not on your block list</span>
      <h3>Opens normally.</h3>
      <p>${esc(host)} isn't a distraction on your list, so FocusWatch stays out of the way.</p>
      <div class="doc-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </div>`);
  };

  const visit = (raw) => {
    const host = normalizeHost(raw);
    if (!host) return;
    $$('[data-site]').forEach((b) => b.classList.toggle('is-active', b.dataset.site === host));
    clearInterval(typing);
    // type the address like a person would, then "load"
    let i = 0;
    address.value = '';
    render(`<p class="vp-loading">Loading ${esc(host)}</p>`);
    typing = setInterval(() => {
      address.value = host.slice(0, ++i);
      if (i >= host.length) {
        clearInterval(typing);
        setTimeout(() => showResult(host), 280);
      }
    }, 28);
  };

  $$('[data-site]').forEach((btn) => btn.addEventListener('click', () => visit(btn.dataset.site)));
  $('[data-address-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    visit(address.value);
  });
  viewport?.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) {
      address.value = 'docs.google.com';
      $$('[data-site]').forEach((b) => b.classList.remove('is-active'));
      render(`<div class="allowed">
        <span class="allowed-badge">↩ Back to work</span>
        <h3>Good call.</h3>
        <p>That's attempt #${attempts} logged. You'll see it in today's stats.</p>
        <div class="doc-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>`);
    } else if (e.target.closest('[data-unlock]')) {
      e.target.closest('[data-unlock]').textContent =
        'In the real extension you type why you need it and a set sentence, wait, then get 5–15 minutes.';
    }
  });

  /* ───────── video slot ───────── */
  const frame = $('.video-frame');
  const src = frame?.dataset.video?.trim();
  if (frame && src) {
    const yt = src.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    if (yt) {
      frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" title="FocusWatch walkthrough" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    } else {
      frame.innerHTML = `<video src="${esc(src)}" controls playsinline preload="metadata"></video>`;
    }
  }

  /* ───────── install tabs ───────── */
  const tabs = $$('[role="tab"]');
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.dataset.tab).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });

  /* ───────── copy buttons ───────── */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = $(btn.dataset.copy)?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const label = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.classList.add('is-copied');
      setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove('is-copied');
      }, 1800);
    });
  });

  /* ───────── scroll reveals ───────── */
  const targets = $$('.section-head, .browser, .video-frame, .card, .node, .steps, .pull, .principles > div, .timeline li, .commits, .faq details, .cta');
  if ('IntersectionObserver' in window) {
    targets.forEach((el) => el.classList.add('on-scroll'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const el = en.target;
            el.classList.add('is-visible');
            io.unobserve(el);
            // drop the stagger once revealed, so hover effects respond instantly
            setTimeout(() => (el.style.transitionDelay = ''), 1100);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    targets.forEach((el, i) => {
      // small stagger for siblings in grids
      el.style.transitionDelay = `${(i % 3) * 70}ms`;
      io.observe(el);
    });
  }
})();
