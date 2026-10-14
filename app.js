(() => {
  'use strict';

  const view = document.getElementById('view');
  const topbar = document.getElementById('topbar');
  const modal = document.getElementById('modal');
  const toasts = document.getElementById('toasts');

  // ---------- Constants ----------
  const STATUS = {
    want: { label: 'Will ich lesen', short: 'Merkliste', icon: '✧' },
    reading: { label: 'Lese ich', short: 'Am Lesen', icon: '☾' },
    read: { label: 'Gelesen', short: 'Gelesen', icon: '✦' },
    dnf: { label: 'Abgebrochen', short: 'Abgebrochen', icon: '⨯' },
  };
  const MOODS = ['düster', 'verträumt', 'herzzerreißend', 'spannend', 'tiefgründig', 'gemütlich',
    'unheimlich', 'romantisch', 'lustig', 'inspirierend', 'episch', 'langsam'];
  const AVATARS = ['☾', '✦', '❦', '✧', '☄', '❧', '✶', '☽', '⚘', '♜', '✺', '❂'];
  const COLORS = ['#b8a4ff', '#8fb8ff', '#c9a7eb', '#9fd4e8', '#e8b4d8', '#a4b4ff', '#b4e0d0', '#e8cfa8'];
  const SUBJECTS = [['Fantasy', 'fantasy'], ['Science-Fiction', 'science fiction'], ['Klassiker', 'classics'],
    ['Horror', 'horror'], ['Krimi', 'mystery'], ['Gothic', 'gothic fiction'], ['Romantik', 'romance'],
    ['Lyrik', 'poetry'], ['Philosophie', 'philosophy'], ['Märchen', 'fairy tales'], ['Geschichte', 'history']];
  const RATING_WORDS = ['Noch nicht bewertet', 'Enttäuschend', 'Mäßig', 'Solide', 'Großartig', 'Unvergesslich'];
  const STAR_PATH = 'M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z';

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Math.max(0, Math.round(Number(n) || 0));
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[0]);
  const bookHref = (key) => `#/book/${encodeURIComponent(key)}`;
  const folderHref = (id) => `#/folder/${encodeURIComponent(id)}`;
  const friendHref = (id) => `#/friend/${encodeURIComponent(id)}`;
  const authorsOf = (b) => (b.authors || []).slice(0, 2).join(', ') || 'Unbekannt';
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const dateValue = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
  const pct = (e) => (e.status === 'read' ? 100 : e.pages ? Math.min(100, Math.round((e.currentPage / e.pages) * 100)) : 0);
  const byDesc = (field) => (a, b) => String(b[field] || '').localeCompare(String(a[field] || ''));
  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  function relTime(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, sec] of units) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
    return 'gerade eben';
  }

  function hue(s) {
    let h = 0;
    for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 225 + (Math.abs(h) % 70);
  }

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    toasts.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2800);
  }

  function errorText(err) {
    const m = String(err?.message || err || '');
    if (/invalid login/i.test(m)) return 'E-Mail oder Passwort stimmen nicht.';
    if (/not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link im Postfach).';
    if (/already registered/i.test(m)) return 'Diese E-Mail ist schon registriert – melde dich an.';
    if (/password/i.test(m) && /6/.test(m)) return 'Das Passwort braucht mindestens 6 Zeichen.';
    if (/rate limit/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz.';
    if (/fetch|network/i.test(m)) return 'Keine Verbindung zum Server.';
    return m || 'Unbekannter Fehler';
  }

  // ---------- UI fragments ----------
  const starRow = () => Array.from({ length: 5 }, () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`).join('');

  function starsHTML(r, cls = '') {
    const v = Number(r) || 0;
    return `<span class="stars ${cls}" style="--p:${(v / 5) * 100}%" role="img" aria-label="${v} von 5 Sternen">
      <span class="stars-base">${starRow()}</span><span class="stars-fill">${starRow()}</span></span>`;
  }

  function starInputHTML(r) {
    const hits = Array.from({ length: 10 }, (_, i) => `<button type="button" data-val="${(i + 1) / 2}" aria-label="${(i + 1) / 2} Sterne"></button>`).join('');
    return `<div class="star-input" data-rating="${Number(r) || 0}">${starsHTML(r, 'lg')}<div class="star-hit">${hits}</div></div>`;
  }

  function bindStarInput(el, onChange, onPreview) {
    const stars = el.querySelector('.stars');
    const show = (v) => { stars.style.setProperty('--p', `${(v / 5) * 100}%`); onPreview?.(v); };
    el.querySelectorAll('[data-val]').forEach((b) => {
      b.addEventListener('pointerenter', () => show(+b.dataset.val));
      b.addEventListener('click', () => {
        let v = +b.dataset.val;
        if (v === +el.dataset.rating) v = 0;
        el.dataset.rating = v;
        show(v);
        onChange(v);
      });
    });
    el.addEventListener('pointerleave', () => show(+el.dataset.rating));
  }

  const ratingLabel = (r) => (r ? `${r.toLocaleString('de-DE')} · ${RATING_WORDS[Math.ceil(r)]}` : RATING_WORDS[0]);

  function coverHTML(b, size = 'M') {
    const url = API.cover(b.coverId, size);
    return `<div class="cover" style="--h:${hue(b.key || b.title)}">
      <div class="cover-fallback"><span>${esc(b.title)}</span><small>${esc((b.authors || [])[0] || '')}</small></div>
      ${url ? `<img src="${url}" alt="Cover von ${esc(b.title)}" loading="lazy" decoding="async">` : ''}
    </div>`;
  }

  // e = the entry whose status/rating is shown (own by default, a friend's on their profile)
  function cardHTML(b, e) {
    return `<a class="book-card" href="${bookHref(b.key)}">
      <div class="book-cover-wrap">${coverHTML(b)}
        ${e && STATUS[e.status] ? `<span class="badge badge-${e.status}">${STATUS[e.status].icon} ${STATUS[e.status].short}</span>` : ''}
      </div>
      <div class="book-meta">
        <h4>${esc(b.title)}</h4>
        <p>${esc(authorsOf(b))}</p>
        ${e?.rating ? starsHTML(e.rating, 'sm') : ''}
        ${e?.status === 'reading' ? `<div class="mini-progress"><span style="width:${pct(e)}%"></span></div>` : ''}
      </div>
    </a>`;
  }
  const bookCard = (b) => cardHTML(b, Store.entry(b.key));

  const skeletons = (n) => Array.from({ length: n }, () => `<div class="book-card skeleton"><div class="book-cover-wrap"><div class="cover"></div></div><div class="book-meta"><h4></h4><p></p></div></div>`).join('');

  const emptyHTML = (title, text, action = '') => `<div class="empty">
    <div class="empty-glyph">☾</div><h3>${title}</h3><p>${text}</p>${action}</div>`;

  function ringHTML(value, max, label) {
    const r = 52;
    const c = 2 * Math.PI * r;
    const p = max ? Math.min(1, value / max) : 0;
    return `<div class="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9b8ff"/><stop offset="1" stop-color="#8fb8ff"/></linearGradient></defs>
        <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
        <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
      </svg>
      <div class="ring-label"><strong>${num(value)}</strong><span>von ${num(max)}</span></div>
      <p>${label}</p>
    </div>`;
  }

  const avatarHTML = (p, size = '') => `<span class="avatar ${size}" style="--c:${safeColor(p.color)}">${esc(p.avatar)}</span>`;

  const pickerHTML = (name, values, selected, isColor) => `<div class="pick-row">${values.map((v) => `
    <label class="pick ${isColor ? 'pick-color' : ''}" ${isColor ? `style="--c:${v}"` : ''}>
      <input type="radio" name="${name}" value="${v}" ${v === selected ? 'checked' : ''}>
      <span>${isColor ? '' : v}</span>
    </label>`).join('')}</div>`;

  function profileFields(p = {}) {
    const year = new Date().getFullYear();
    return `
      <label class="field"><span>Name</span><input name="name" required maxlength="40" autocomplete="nickname" value="${esc(p.name || '')}" placeholder="Wie sollen wir dich nennen?"></label>
      <label class="field"><span>Über dich <em>(optional)</em></span><input name="bio" maxlength="140" value="${esc(p.bio || '')}" placeholder="Liest am liebsten nachts, bei Regen …"></label>
      <div class="field"><span>Symbol</span>${pickerHTML('avatar', AVATARS, p.avatar || AVATARS[0], false)}</div>
      <div class="field"><span>Farbe</span>${pickerHTML('color', COLORS, safeColor(p.color), true)}</div>
      <label class="field"><span>Leseziel ${year} (Bücher)</span><input name="goal" type="number" min="1" max="999" inputmode="numeric" value="${num(p.goal) || 24}"></label>`;
  }

  function readProfileForm(form) {
    const fd = new FormData(form);
    return {
      name: String(fd.get('name')).trim(),
      bio: String(fd.get('bio') || '').trim(),
      avatar: AVATARS.includes(fd.get('avatar')) ? fd.get('avatar') : AVATARS[0],
      color: safeColor(fd.get('color')),
      goal: Math.min(999, Math.max(1, num(fd.get('goal')) || 24)),
    };
  }

  function computeStats(entries) {
    const year = new Date().getFullYear();
    const read = entries.filter((e) => e.status === 'read');
    const thisYear = read.filter((e) => e.finishedAt && new Date(e.finishedAt).getFullYear() === year);
    const rated = entries.filter((e) => e.rating > 0);
    const months = Array(12).fill(0);
    thisYear.forEach((e) => { months[new Date(e.finishedAt).getMonth()]++; });
    const tally = (arr) => Object.entries(arr.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
    return {
      year,
      read: read.length,
      thisYear: thisYear.length,
      reading: entries.filter((e) => e.status === 'reading').length,
      pages: read.reduce((s, e) => s + num(e.pages), 0) + entries.filter((e) => e.status === 'reading').reduce((s, e) => s + num(e.currentPage), 0),
      avg: rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0,
      reviews: entries.filter((e) => e.review?.trim()).length,
      dist: [5, 4, 3, 2, 1].map((n) => [n, rated.filter((e) => Math.ceil(e.rating) === n).length]),
      months,
      moods: tally(entries.flatMap((e) => e.moods || [])).slice(0, 8),
      authors: tally(read.flatMap((e) => (e.authors || []).slice(0, 1))).slice(0, 5),
    };
  }

  const fmtAvg = (v) => (v ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–');

  // ---------- Feed ----------
  function feedEvents(limit, othersOnly = false) {
    const people = othersOnly ? Store.members() : [Store.profile(), ...Store.members()];
    const events = [];
    for (const p of people) {
      for (const e of Object.values(p.books || {})) {
        if (!e?.key || !STATUS[e.status]) continue;
        if (e.status === 'want' && e.addedAt) events.push({ p, e, date: e.addedAt, type: 'want' });
        if (e.startedAt) events.push({ p, e, date: e.startedAt, type: 'started' });
        (e.progressLog || []).slice(0, 6).forEach((l) => { if (l?.date) events.push({ p, e, date: l.date, type: 'progress', log: l }); });
        if (e.status === 'read' && e.finishedAt) events.push({ p, e, date: e.finishedAt, type: 'finished' });
        if (e.status === 'dnf' && e.updatedAt) events.push({ p, e, date: e.updatedAt, type: 'dnf' });
      }
    }
    return events.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
  }

  function feedItemHTML(x) {
    const isMe = x.p.id === Store.profile().id;
    const who = isMe ? 'Du' : `<a class="who" href="${friendHref(x.p.id)}">${esc(x.p.name)}</a>`;
    const title = `<a class="what" href="${bookHref(x.e.key)}">${esc(x.e.title)}</a>`;
    const has = isMe ? 'hast' : 'hat';
    const text = {
      want: `${who} ${has} ${title} auf die Merkliste gesetzt`,
      started: `${who} ${has} ${title} aufgeschlagen`,
      progress: `${who} ${isMe ? 'bist' : 'ist'} auf Seite ${num(x.log?.page)}${x.e.pages ? ` von ${num(x.e.pages)}` : ''} in ${title}`,
      finished: `${who} ${has} ${title} ausgelesen`,
      dnf: `${who} ${has} ${title} abgebrochen`,
    }[x.type];
    let extra = '';
    if (x.type === 'finished') {
      extra = `${x.e.rating ? starsHTML(x.e.rating, 'sm') : ''}${x.e.review ? `<blockquote>${esc(truncate(x.e.review, 320))}</blockquote>` : ''}`;
    } else if (x.type === 'progress' && x.log.note) {
      extra = `<blockquote>${esc(truncate(x.log.note, 320))}</blockquote>`;
    }
    return `<article class="feed-item">
      <a href="${isMe ? '#/profile' : friendHref(x.p.id)}" class="feed-avatar">${avatarHTML(x.p, 'sm')}</a>
      <div class="feed-body"><p>${text}</p>${extra}<time datetime="${esc(x.date)}">${relTime(x.date)}</time></div>
      <a class="feed-cover" href="${bookHref(x.e.key)}" tabindex="-1">${coverHTML(x.e)}</a>
    </article>`;
  }

  const feedHTML = (events, emptyText) => (events.length
    ? events.map(feedItemHTML).join('')
    : `<p class="muted feed-empty">${emptyText}</p>`);

  // Re-render once fresh group data arrives, if anything changed.
  function refreshGroupThen(isStale) {
    Store.refreshGroup()
      .then((changed) => { if (changed && !isStale()) render({ keepScroll: true }); })
      .catch(() => {});
  }

  // ---------- Modal ----------
  function openModal(html, mount) {
    modal.innerHTML = html;
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    mount?.(modal);
    if (!modal.open) modal.showModal();
  }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  function confirmModal(title, text, yesLabel, onYes) {
    openModal(`<div class="modal-body">
      <h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>Abbrechen</button><button type="button" class="btn danger" id="yes">${esc(yesLabel)}</button></div>
    </div>`, (root) => { root.querySelector('#yes').onclick = () => { closeModal(); onYes(); }; });
  }

  function openProgressModal(key, onDone) {
    const e = Store.entry(key);
    if (!e) return;
    openModal(`<form class="modal-body">
      <p class="eyebrow">Fortschritt</p>
      <h2>${esc(e.title)}</h2>
      <div class="grid-2">
        <label class="field"><span>Aktuelle Seite</span><input type="number" name="page" min="0" inputmode="numeric" value="${num(e.currentPage)}" required></label>
        <label class="field"><span>Seiten gesamt</span><input type="number" name="pages" min="1" inputmode="numeric" value="${e.pages ? num(e.pages) : ''}" placeholder="unbekannt"></label>
      </div>
      <input type="range" class="range" name="range" min="0" aria-label="Seite">
      <p class="range-pct" id="rp"></p>
      <label class="field"><span>Notiz <em>(optional, sieht dein Lesekreis)</em></span><textarea name="note" rows="3" maxlength="2000" placeholder="Ein Satz, ein Gefühl, ein Zitat …"></textarea></label>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div>
    </form>`, (root) => {
      const form = root.querySelector('form');
      const f = form.elements;
      const sync = (from) => {
        const pages = num(f.pages.value);
        if (from === 'range') f.page.value = f.range.value;
        f.range.max = pages || Math.max(500, num(f.page.value));
        if (from !== 'range') f.range.value = f.page.value;
        f.range.style.setProperty('--p', `${(f.range.value / f.range.max) * 100}%`);
        root.querySelector('#rp').textContent = pages ? `${Math.min(100, Math.round((num(f.page.value) / pages) * 100))} %` : '';
      };
      f.page.oninput = () => sync('page');
      f.pages.oninput = () => sync('pages');
      f.range.oninput = () => sync('range');
      sync();
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const pages = num(f.pages.value) || null;
        const page = num(f.page.value);
        if (pages !== e.pages) Store.updateBook(key, { pages });
        Store.logProgress(key, page, f.note.value.trim());
        if (pages && page >= pages && Store.entry(key).status !== 'read') {
          Store.updateBook(key, { status: 'read' });
          toast('Ausgelesen. Zeit für ein paar Sterne ✦');
        } else {
          toast('Fortschritt gespeichert');
        }
        closeModal();
        onDone?.();
      };
    });
  }

  function openFolderModal(folder, onSave) {
    openModal(`<form class="modal-body">
      <p class="eyebrow">Sammlung</p>
      <h2>${folder ? 'Sammlung bearbeiten' : 'Neue Sammlung'}</h2>
      <label class="field"><span>Name</span><input name="name" required maxlength="60" value="${esc(folder?.name || '')}" placeholder="z. B. Für Regennächte"></label>
      <label class="field"><span>Beschreibung <em>(optional)</em></span><textarea name="desc" rows="3" maxlength="500" placeholder="Worum geht es in dieser Sammlung?">${esc(folder?.desc || '')}</textarea></label>
      <div class="field"><span>Farbe</span>${pickerHTML('color', COLORS, safeColor(folder?.color || COLORS[Math.floor(Math.random() * COLORS.length)]), true)}</div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div>
    </form>`, (root) => {
      root.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const data = { name: String(fd.get('name')).trim(), desc: String(fd.get('desc')).trim(), color: safeColor(fd.get('color')) };
        if (!data.name) return;
        const f = folder ? Store.updateFolder(folder.id, data) : Store.createFolder(data);
        closeModal();
        toast(folder ? 'Sammlung aktualisiert' : `„${f.name}“ angelegt`);
        onSave?.(f);
      };
    });
  }

  function openFolderPicker(book, onChange) {
    const key = book.key;
    const draw = () => {
      const folders = Store.profile().folders;
      openModal(`<div class="modal-body">
        <p class="eyebrow">Zu Sammlung hinzufügen</p>
        <h2>${esc(book.title)}</h2>
        <div class="picker-list">${folders.map((f) => `
          <button type="button" class="picker-row ${f.bookKeys.includes(key) ? 'on' : ''}" data-fid="${esc(f.id)}" style="--c:${safeColor(f.color)}">
            <span class="dot"></span><span class="name">${esc(f.name)}</span><span class="count">${f.bookKeys.length}</span><span class="check">✓</span>
          </button>`).join('') || '<p class="muted">Noch keine Sammlungen – leg direkt eine an.</p>'}</div>
        <form class="inline-form"><input name="name" placeholder="Neue Sammlung …" maxlength="60" required><button class="btn sm">Anlegen</button></form>
        <div class="modal-actions"><button type="button" class="btn primary" data-close>Fertig</button></div>
      </div>`, (root) => {
        root.querySelectorAll('[data-fid]').forEach((b) => b.onclick = () => {
          if (!Store.entry(key)) Store.upsertBook(book, { status: 'want' });
          Store.toggleInFolder(b.dataset.fid, key);
          draw();
          onChange?.();
        });
        root.querySelector('.inline-form').onsubmit = (ev) => {
          ev.preventDefault();
          const name = ev.target.elements.name.value.trim();
          if (!name) return;
          if (!Store.entry(key)) Store.upsertBook(book, { status: 'want' });
          const f = Store.createFolder({ name, desc: '', color: COLORS[Store.profile().folders.length % COLORS.length] });
          Store.toggleInFolder(f.id, key);
          draw();
          onChange?.();
        };
      });
    };
    draw();
  }

  function openProfileModal() {
    const p = Store.profile();
    openModal(`<form class="modal-body">
      <p class="eyebrow">Profil</p>
      <h2>Profil bearbeiten</h2>
      ${profileFields(p)}
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div>
    </form>`, (root) => {
      root.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const data = readProfileForm(ev.target);
        if (!data.name) return;
        Store.updateProfile(data);
        closeModal();
        toast('Profil gespeichert');
        render({ keepScroll: true });
      };
    });
  }

  function exportBackup() {
    const blob = new Blob([Store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lesemaus-backup-${dateValue(new Date().toISOString())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exportiert');
  }

  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const n = Store.importData(await file.text());
        toast(`${plural(n, 'Buch', 'Bücher')} importiert`);
        render({ keepScroll: true });
      } catch (err) {
        toast(`Import fehlgeschlagen: ${err.message}`, 'error');
      }
    };
    input.click();
  }

  async function signOut() {
    await Store.flush();
    await Cloud.signOut();
    Store.reset();
    location.hash = '#/';
    render();
  }

  // ---------- Entry views ----------
  function viewSetup() {
    const libMissing = !window.supabase;
    view.innerHTML = `<section class="onboarding">
      <div class="onb-moon" aria-hidden="true"></div>
      <h1 class="display">${libMissing ? 'Keine Verbindung' : 'Fast geschafft'}</h1>
      <p class="lead">${libMissing ? 'Lesemaus braucht eine Internetverbindung zum Starten.' : 'Lesemaus braucht noch die Verbindung zu deiner Supabase-Datenbank.'}</p>
      ${libMissing ? '<button type="button" class="btn primary" onclick="location.reload()">Erneut versuchen</button>' : `
      <div class="card glass onb-form setup">
        <ol>
          <li>Kostenloses Projekt auf <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a> anlegen.</li>
          <li>Im <strong>SQL Editor</strong> den Inhalt von <code>supabase/schema.sql</code> ausführen.</li>
          <li>Unter <strong>Project Settings → API</strong> die Project URL und den <em>anon public</em> Key in <code>js/config.js</code> eintragen.</li>
          <li>Seite neu laden.</li>
        </ol>
      </div>`}
    </section>`;
  }

  function viewAuth() {
    let mode = 'login';
    const draw = (msg = '', msgType = '') => {
      view.innerHTML = `<section class="onboarding">
        <div class="onb-moon" aria-hidden="true"></div>
        <p class="eyebrow">Dein Lesetagebuch – gemeinsam</p>
        <h1 class="display xl">Lesemaus</h1>
        <p class="lead">Ein stiller Ort für jedes Buch, das dich je wachgehalten hat.</p>
        <form class="card glass onb-form">
          <div class="segmented auth-switch" role="tablist">
            <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">Anmelden</button>
            <button type="button" data-mode="signup" class="${mode === 'signup' ? 'active' : ''}">Registrieren</button>
          </div>
          <label class="field"><span>E-Mail</span><input name="email" type="email" required autocomplete="email" placeholder="du@beispiel.de"></label>
          <label class="field"><span>Passwort</span><input name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'login' ? '••••••••' : 'mindestens 6 Zeichen'}"></label>
          ${msg ? `<p class="form-msg ${msgType}">${esc(msg)}</p>` : ''}
          <button class="btn primary block">${mode === 'login' ? 'Eintreten' : 'Konto erstellen'}</button>
        </form>
      </section>`;
      view.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; draw(); });
      const form = view.querySelector('form');
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const btn = form.querySelector('.btn.primary');
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          if (mode === 'login') {
            await Cloud.signIn(email, password);
          } else {
            const { needsConfirm } = await Cloud.signUp(email, password);
            if (needsConfirm) {
              mode = 'login';
              draw('Fast da: Bestätige deine E-Mail über den Link in deinem Postfach und melde dich dann hier an.', 'ok');
              return;
            }
          }
          await Store.load();
          render();
        } catch (err) {
          draw(errorText(err), 'error');
          view.querySelector('[name=email]').value = email;
        }
      };
    };
    draw();
  }

  function viewOnboarding() {
    view.innerHTML = `<section class="onboarding">
      <div class="onb-moon" aria-hidden="true"></div>
      <p class="eyebrow">Willkommen</p>
      <h1 class="display">Wer liest hier?</h1>
      <p class="lead">So sieht dich dein Lesekreis.</p>
      <form class="card glass onb-form">
        <h2>Profil erstellen</h2>
        ${profileFields()}
        <button class="btn primary block">Eintreten</button>
      </form>
      <button type="button" class="link-btn" id="logout">Mit anderem Konto anmelden</button>
    </section>`;
    const form = view.querySelector('form');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const data = readProfileForm(form);
      if (!data.name) return;
      const btn = form.querySelector('.btn.primary');
      btn.disabled = true;
      try {
        await Store.createProfile(data);
        toast(`Willkommen, ${data.name}`);
        render();
      } catch (err) {
        btn.disabled = false;
        toast(errorText(err), 'error');
      }
    };
    view.querySelector('#logout').onclick = signOut;
  }

  // ---------- Main views ----------
  function viewHome({ isStale }) {
    const p = Store.profile();
    const all = Store.entries();
    const reading = all.filter((e) => e.status === 'reading').sort(byDesc('updatedAt'));
    const want = all.filter((e) => e.status === 'want').sort(byDesc('addedAt'));
    const recent = all.filter((e) => e.status === 'read').sort(byDesc('finishedAt')).slice(0, 12);
    const year = new Date().getFullYear();
    const readThisYear = all.filter((e) => e.status === 'read' && e.finishedAt && new Date(e.finishedAt).getFullYear() === year).length;
    const h = new Date().getHours();
    const greeting = h < 5 ? 'Noch wach' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
    const left = Math.max(0, (p.goal || 0) - readThisYear);
    const subline = reading.length
      ? `${reading.length === 1 ? 'Ein Buch wartet' : `${reading.length} Bücher warten`} darauf, weitergelesen zu werden.`
      : 'Welche Geschichte darf es heute sein?';
    const g = Store.group();

    view.innerHTML = `
      <section class="hero-home">
        <div>
          <p class="eyebrow">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 class="display">${greeting},<br><em>${esc(p.name)}</em>.</h1>
          <p class="lead">${subline}</p>
          <p class="muted goal-note">${left ? `Noch ${plural(left, 'Buch', 'Bücher')} bis zu deinem Ziel für ${year}.` : `Leseziel ${year} erreicht. Alles weitere ist Sternenstaub.`}</p>
        </div>
        ${ringHTML(readThisYear, p.goal || 0, `Leseziel ${year}`)}
      </section>

      <section class="section">
        <header class="section-head"><h2>Gerade aufgeschlagen</h2>${reading.length ? '<a class="see-all" href="#/library?s=reading">Alle ansehen</a>' : ''}</header>
        ${reading.length ? `<div class="reading-list">${reading.map((e) => `
          <article class="reading-card glass">
            <a href="${bookHref(e.key)}" class="rc-cover">${coverHTML(e)}</a>
            <div class="rc-body">
              <h3><a href="${bookHref(e.key)}">${esc(e.title)}</a></h3>
              <p class="muted">${esc(authorsOf(e))}</p>
              <div class="progress"><span style="width:${pct(e)}%"></span></div>
              <div class="rc-foot">
                <span>${e.pages ? `Seite ${num(e.currentPage)} / ${num(e.pages)}` : `Seite ${num(e.currentPage)}`} · <strong>${pct(e)}%</strong></span>
                <button type="button" class="btn ghost sm" data-progress="${esc(e.key)}">Weiter</button>
              </div>
            </div>
          </article>`).join('')}</div>`
        : emptyHTML('Kein Buch aufgeschlagen', 'Such dir etwas aus – oder beginne eines von deiner Merkliste.', '<a class="btn primary" href="#/search">Entdecken</a>')}
      </section>

      <section class="section">
        ${g ? `<header class="section-head"><h2>Im Lesekreis</h2><a class="see-all" href="#/circle">Alles ansehen</a></header>
          <div class="feed">${feedHTML(feedEvents(5, true), Store.members().length ? 'Noch ist es still im Kreis.' : 'Noch bist du allein hier. Teile deinen Einladungscode im Lesekreis.')}</div>`
        : `<a class="card glass invite-teaser" href="#/circle">
            <span class="teaser-glyph">❂</span>
            <div><h3>Lies gemeinsam</h3><p class="muted">Gründe einen Lesekreis oder tritt einem bei – und sieh, was deine Freund:innen gerade lesen.</p></div>
            <span class="see-all">Lesekreis →</span>
          </a>`}
      </section>

      ${want.length ? `<section class="section">
        <header class="section-head"><h2>Auf der Merkliste</h2><a class="see-all" href="#/library?s=want">Alle ${want.length}</a></header>
        <div class="shelf">${want.slice(0, 14).map(bookCard).join('')}</div>
      </section>` : ''}

      ${recent.length ? `<section class="section">
        <header class="section-head"><h2>Zuletzt ausgelesen</h2><a class="see-all" href="#/library?s=read">Alle ansehen</a></header>
        <div class="shelf">${recent.map(bookCard).join('')}</div>
      </section>` : ''}

      <section class="section" id="trending-section">
        <header class="section-head"><h2>Diese Woche gefragt</h2><a class="see-all" href="#/search">Mehr entdecken</a></header>
        <div class="shelf" id="trending">${skeletons(8)}</div>
      </section>`;

    API.trending().then((books) => {
      if (isStale()) return;
      view.querySelector('#trending').innerHTML = books.slice(0, 16).map(bookCard).join('');
    }).catch(() => { if (!isStale()) view.querySelector('#trending-section').remove(); });

    refreshGroupThen(isStale);
  }

  async function viewSearch({ params, isStale }) {
    const q = (params.get('q') || '').trim();
    const subject = params.get('subject');
    const label = params.get('label') || subject;
    const title = q ? 'Suchergebnisse' : subject ? label : 'Entdecken';

    view.innerHTML = `
      <section class="search-hero">
        <p class="eyebrow">Über 20 Millionen Bücher aus der Open Library</p>
        <h1 class="display">${esc(title)}</h1>
        <form class="big-search" role="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input type="search" name="q" value="${esc(q)}" placeholder="Titel, Autor:in oder ISBN …" aria-label="Suche">
          <button class="btn primary">Suchen</button>
        </form>
        <div class="chips center">${SUBJECTS.map(([l, s]) => `<a class="chip ${subject === s ? 'active' : ''}" href="#/search?subject=${encodeURIComponent(s)}&label=${encodeURIComponent(l)}">${l}</a>`).join('')}</div>
      </section>
      <section class="section">
        <header class="section-head"><h2 id="results-title">${q ? `„${esc(q)}“` : subject ? 'Beliebt in diesem Genre' : 'Diese Woche gefragt'}</h2><span class="muted" id="results-count"></span></header>
        <div class="grid" id="results">${skeletons(12)}</div>
      </section>`;

    const form = view.querySelector('.big-search');
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const v = form.elements.q.value.trim();
      if (v) location.hash = `#/search?q=${encodeURIComponent(v)}`;
    };
    if (!q && !subject) form.elements.q.focus();

    const results = view.querySelector('#results');
    try {
      const books = q ? await API.search(q) : subject ? await API.search(`subject:"${subject}"`) : await API.trending();
      if (isStale()) return;
      view.querySelector('#results-count').textContent = books.length ? plural(books.length, 'Buch', 'Bücher') : '';
      results.innerHTML = books.length
        ? books.map(bookCard).join('')
        : emptyHTML('Nichts gefunden', 'Versuch es mit einem anderen Titel, einer Autorin oder einer ISBN.');
    } catch {
      if (isStale()) return;
      results.innerHTML = emptyHTML('Die Bibliothek schweigt', 'Open Library ist gerade nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.',
        '<button type="button" class="btn ghost" onclick="location.reload()">Erneut versuchen</button>');
    }
  }

  async function viewBook({ arg: key, isStale }) {
    if (!key) { location.hash = '#/search'; return; }
    const entry = Store.entry(key) || Store.members().map((m) => m.books[key]).find(Boolean);
    if (entry) drawBook(entry);
    else view.innerHTML = '<div class="loading-page"><div class="spinner"></div><p class="muted">Blättere in den Archiven …</p></div>';

    try {
      const w = await API.work(key);
      if (isStale()) return;
      const e = Store.entry(key);
      if (e && !e.pages && w.pages) Store.updateBook(key, { pages: w.pages });
      if (e && !e.coverId && w.coverId) Store.updateBook(key, { coverId: w.coverId });
      if (!entry) drawBook(w);
      fillDetails(w);
    } catch {
      if (isStale()) return;
      if (entry) fillDetails(null);
      else view.innerHTML = emptyHTML('Dieses Buch ließ sich nicht laden', 'Vielleicht ist Open Library gerade nicht erreichbar.', '<a class="btn ghost" href="#/search">Zurück zur Suche</a>');
    }
  }

  function fillDetails(w) {
    const desc = view.querySelector('#desc');
    if (!desc) return;
    desc.innerHTML = w?.description
      ? w.description.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
      : '<p class="muted">Für dieses Buch gibt es noch keine Beschreibung.</p>';
    if (w?.subjects?.length) {
      view.querySelector('#subjects').innerHTML = w.subjects.map((s) => `<a class="chip sm" href="#/search?subject=${encodeURIComponent(s.toLowerCase())}&label=${encodeURIComponent(s)}">${esc(s)}</a>`).join('');
    }
    const e = Store.entry(w?.key);
    const pages = e?.pages || w?.pages;
    if (pages) view.querySelector('#fact-pages').textContent = `${num(pages)} Seiten`;
  }

  function drawBook(source) {
    const key = source.key;
    const book = { key, title: source.title, authors: source.authors || [], coverId: source.coverId, year: source.year, pages: source.pages };
    const big = API.cover(book.coverId, 'L');
    view.innerHTML = `
      <section class="book-hero">
        <div class="book-backdrop" style="--h:${hue(key)};${big ? `background-image:url('${big}')` : ''}"></div>
        <div class="book-hero-inner">
          <div class="book-cover-lg">${coverHTML(book, 'L')}</div>
          <div class="book-head">
            <p class="eyebrow">${book.year ? `Erstveröffentlichung ${num(book.year)}` : 'Open Library'}</p>
            <h1 class="display">${esc(book.title)}</h1>
            <p class="book-authors">von ${esc(book.authors.join(', ') || 'Unbekannt')}</p>
            <div class="facts"><span id="fact-pages">${book.pages ? `${num(book.pages)} Seiten` : ''}</span></div>
            <div id="actions"></div>
          </div>
        </div>
      </section>
      <div class="book-layout">
        <div class="book-main">
          <section class="card glass">
            <h2>Über das Buch</h2>
            <div id="desc" class="prose"><div class="shimmer-lines"><span></span><span></span><span></span><span></span></div></div>
            <div class="chips" id="subjects"></div>
          </section>
          <section class="card glass" id="circle-panel" hidden></section>
          <section class="card glass" id="progress-panel" hidden></section>
          <section class="card glass review" id="review-panel"></section>
        </div>
        <aside class="book-side" id="side"></aside>
      </div>`;

    const $ = (s) => view.querySelector(s);
    const ensure = (status) => Store.entry(key) || Store.upsertBook(book, { status });

    function renderActions() {
      const e = Store.entry(key);
      $('#actions').innerHTML = `<div class="segmented" role="group" aria-label="Lesestatus">${Object.entries(STATUS).map(([k, s]) => `
        <button type="button" data-status="${k}" class="${e?.status === k ? 'active' : ''}" aria-pressed="${e?.status === k}"><i>${s.icon}</i>${s.label}</button>`).join('')}</div>
        ${e?.status === 'reading' ? `<button type="button" class="btn primary" data-progress="${esc(key)}">Fortschritt eintragen</button>` : ''}`;
      $('#actions').querySelectorAll('[data-status]').forEach((b) => b.onclick = () => {
        const st = b.dataset.status;
        if (Store.entry(key)) Store.updateBook(key, { status: st }); else Store.upsertBook(book, { status: st });
        toast(`${STATUS[st].icon} ${STATUS[st].label}`);
        refresh();
      });
    }

    function renderCircle() {
      const el = $('#circle-panel');
      const friends = Store.members().filter((m) => m.books[key] && STATUS[m.books[key].status]);
      if (!friends.length) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = `<h2>Im Lesekreis</h2>
        <div class="friend-takes">${friends.map((m) => {
          const fe = m.books[key];
          return `<article class="friend-take">
            <a href="${friendHref(m.id)}">${avatarHTML(m, 'sm')}</a>
            <div>
              <p><a class="who" href="${friendHref(m.id)}">${esc(m.name)}</a> <span class="muted">· ${STATUS[fe.status].icon} ${STATUS[fe.status].label}${fe.status === 'reading' && fe.pages ? ` · ${pct(fe)}%` : ''}</span></p>
              ${fe.rating ? starsHTML(fe.rating, 'sm') : ''}
              ${fe.moods?.length ? `<div class="chips tiny">${fe.moods.slice(0, 5).map((mo) => `<span class="chip sm">${esc(mo)}</span>`).join('')}</div>` : ''}
              ${fe.review ? `<blockquote>${esc(fe.review)}</blockquote>` : ''}
            </div>
          </article>`;
        }).join('')}</div>`;
    }

    function renderReview() {
      const e = Store.entry(key);
      const r = e?.rating || 0;
      $('#review-panel').innerHTML = `
        <h2>Deine Bewertung</h2>
        <div class="rating-row">${starInputHTML(r)}<span class="rating-value" id="rv">${ratingLabel(r)}</span></div>
        <p class="label">Wie hat es sich angefühlt?</p>
        <div class="chips">${MOODS.map((m) => `<button type="button" class="chip ${e?.moods?.includes(m) ? 'active' : ''}" data-mood="${m}">${m}</button>`).join('')}</div>
        <label class="field"><span>Rezension</span><textarea id="review" rows="7" maxlength="20000" placeholder="Was bleibt, wenn du das Buch zuklappst?">${esc(e?.review || '')}</textarea></label>
        <p class="save-hint" id="save-hint">${e?.review ? 'Gespeichert · sichtbar für deinen Lesekreis' : 'Wird automatisch gespeichert'}</p>`;

      const afterCreate = (wasNew) => { if (wasNew) { renderActions(); renderProgress(); renderSide(); } };
      bindStarInput($('.star-input'), (v) => {
        const wasNew = !Store.entry(key);
        ensure('read');
        Store.updateBook(key, { rating: v });
        afterCreate(wasNew);
      }, (v) => { $('#rv').textContent = ratingLabel(v); });

      $('#review-panel').querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => {
        const wasNew = !Store.entry(key);
        const cur = ensure('read');
        const m = b.dataset.mood;
        const moods = cur.moods.includes(m) ? cur.moods.filter((x) => x !== m) : [...cur.moods, m];
        Store.updateBook(key, { moods });
        b.classList.toggle('active');
        afterCreate(wasNew);
      });

      let timer;
      $('#review').oninput = (ev) => {
        const hint = $('#save-hint');
        hint.textContent = 'Schreibt …';
        clearTimeout(timer);
        timer = setTimeout(() => {
          const wasNew = !Store.entry(key);
          ensure('read');
          Store.updateBook(key, { review: ev.target.value });
          hint.textContent = 'Gespeichert ✓ · sichtbar für deinen Lesekreis';
          afterCreate(wasNew);
        }, 600);
      };
    }

    function renderProgress() {
      const e = Store.entry(key);
      const el = $('#progress-panel');
      if (!e || e.status === 'want') { el.hidden = true; return; }
      el.hidden = false;
      const p = pct(e);
      el.innerHTML = `
        <header class="section-head"><h2>Lesereise</h2><button type="button" class="btn ghost sm" data-progress="${esc(key)}">+ Eintrag</button></header>
        <div class="progress lg"><span style="width:${p}%"></span></div>
        <p class="progress-text">${e.pages ? `Seite ${num(e.currentPage)} von ${num(e.pages)}` : `Seite ${num(e.currentPage)}`} · <strong>${p}%</strong></p>
        <div class="grid-2">
          <label class="field"><span>Begonnen</span><input type="date" data-date="startedAt" value="${dateValue(e.startedAt)}"></label>
          <label class="field"><span>Beendet</span><input type="date" data-date="finishedAt" value="${dateValue(e.finishedAt)}"></label>
        </div>
        ${e.progressLog.length ? `<ol class="timeline">${e.progressLog.map((l) => `
          <li>
            <span class="tl-dot"></span>
            <div class="tl-body">
              <p class="tl-meta">${fmtDate(l.date)} · Seite ${num(l.page)}${e.pages ? ` · ${Math.min(100, Math.round((l.page / e.pages) * 100))}%` : ''}</p>
              ${l.note ? `<p class="tl-note">${esc(l.note)}</p>` : ''}
            </div>
            <button type="button" class="icon-btn" data-del-log="${esc(l.id)}" aria-label="Eintrag löschen">×</button>
          </li>`).join('')}</ol>`
        : '<p class="muted">Noch keine Einträge. Halte fest, wo du stehst – und was dich bewegt.</p>'}`;

      el.querySelectorAll('[data-date]').forEach((inp) => inp.onchange = () => {
        Store.updateBook(key, { [inp.dataset.date]: inp.value ? new Date(`${inp.value}T12:00`).toISOString() : null });
        renderSide();
      });
      el.querySelectorAll('[data-del-log]').forEach((b) => b.onclick = () => {
        Store.removeLog(key, b.dataset.delLog);
        renderProgress();
      });
    }

    function renderSide() {
      const e = Store.entry(key);
      const folders = Store.profile().folders.filter((f) => f.bookKeys.includes(key));
      $('#side').innerHTML = `
        <div class="card glass">
          <h3>Sammlungen</h3>
          ${folders.length ? `<div class="chips">${folders.map((f) => `<a class="chip tinted" style="--c:${safeColor(f.color)}" href="${folderHref(f.id)}">${esc(f.name)}</a>`).join('')}</div>` : '<p class="muted">Noch in keiner Sammlung.</p>'}
          <button type="button" class="btn ghost sm block" id="to-folder">+ Zu Sammlung hinzufügen</button>
        </div>
        ${e ? `<div class="card glass">
          <h3>In deiner Bibliothek</h3>
          <dl class="meta-list">
            <dt>Status</dt><dd>${STATUS[e.status].icon} ${STATUS[e.status].label}</dd>
            <dt>Hinzugefügt</dt><dd>${fmtDate(e.addedAt)}</dd>
            ${e.startedAt ? `<dt>Begonnen</dt><dd>${fmtDate(e.startedAt)}</dd>` : ''}
            ${e.finishedAt ? `<dt>Beendet</dt><dd>${fmtDate(e.finishedAt)}</dd>` : ''}
          </dl>
          <button type="button" class="btn danger sm block" id="remove">Aus Bibliothek entfernen</button>
        </div>` : ''}
        <a class="card glass ol-link" href="https://openlibrary.org/works/${encodeURIComponent(key)}" target="_blank" rel="noopener noreferrer">Auf Open Library ansehen <span>↗</span></a>`;

      $('#to-folder').onclick = () => openFolderPicker(book, () => { renderSide(); renderActions(); renderProgress(); });
      $('#remove')?.addEventListener('click', () => confirmModal('Buch entfernen?', 'Bewertung, Rezension und Fortschritt gehen dabei verloren.', 'Entfernen', () => {
        Store.removeBook(key);
        toast('Aus der Bibliothek entfernt');
        refresh();
      }));
    }

    function refresh() { renderActions(); renderCircle(); renderReview(); renderProgress(); renderSide(); }
    refresh();
  }

  function viewLibrary({ params }) {
    const s = STATUS[params.get('s')] ? params.get('s') : 'all';
    const sort = params.get('sort') || 'recent';
    const all = Store.entries();
    const count = (k) => all.filter((e) => e.status === k).length;
    const sorters = {
      recent: byDesc('updatedAt'),
      added: byDesc('addedAt'),
      title: (a, b) => a.title.localeCompare(b.title, 'de'),
      author: (a, b) => authorsOf(a).localeCompare(authorsOf(b), 'de'),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    const list = all.filter((e) => s === 'all' || e.status === s).sort(sorters[sort] || sorters.recent);
    const tab = (k, label, n) => `<a class="tab ${s === k ? 'active' : ''}" href="#/library?s=${k}&sort=${sort}">${label}<span>${n}</span></a>`;

    view.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">${plural(all.length, 'Buch', 'Bücher')}</p>
        <h1 class="display">Bibliothek</h1>
      </section>
      <nav class="tabs">
        ${tab('all', 'Alle', all.length)}
        ${Object.entries(STATUS).map(([k, st]) => tab(k, st.short, count(k))).join('')}
      </nav>
      <div class="toolbar">
        <input type="search" class="input" id="filter" placeholder="In der Bibliothek filtern …" aria-label="Filtern">
        <select class="input" id="sort" aria-label="Sortieren">
          ${[['recent', 'Zuletzt bearbeitet'], ['added', 'Zuletzt hinzugefügt'], ['title', 'Titel'], ['author', 'Autor:in'], ['rating', 'Bewertung']]
            .map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      ${list.length ? `<div class="grid" id="lib-grid">${list.map((e) => `<div class="card-wrap" data-hay="${esc(`${e.title} ${(e.authors || []).join(' ')}`.toLowerCase())}">${bookCard(e)}</div>`).join('')}</div>`
        : emptyHTML('Hier ist es noch still', 'Füge Bücher über die Suche hinzu – sie erscheinen dann hier.', '<a class="btn primary" href="#/search">Bücher entdecken</a>')}`;

    view.querySelector('#sort').onchange = (ev) => { location.hash = `#/library?s=${s}&sort=${ev.target.value}`; };
    view.querySelector('#filter').oninput = (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      view.querySelectorAll('.card-wrap').forEach((c) => { c.hidden = q && !c.dataset.hay.includes(q); });
    };
  }

  function folderStack(f, books) {
    const shown = f.bookKeys.map((k) => books[k]).filter(Boolean).slice(0, 3);
    return `<div class="folder-stack">${shown.length ? shown.map((b, i) => `<div class="stack-item" style="--i:${i - (shown.length - 1) / 2}">${coverHTML(b)}</div>`).join('') : '<div class="stack-empty">✧</div>'}</div>`;
  }

  const folderCardHTML = (f, books, href) => `
    <a class="folder-card glass" href="${href}" style="--c:${safeColor(f.color)}">
      ${folderStack(f, books)}
      <div class="folder-info"><h3>${esc(f.name)}</h3><p>${plural(f.bookKeys.length, 'Buch', 'Bücher')}</p></div>
    </a>`;

  function viewFolders() {
    const p = Store.profile();
    view.innerHTML = `
      <section class="page-head with-action">
        <div><p class="eyebrow">${plural(p.folders.length, 'Sammlung', 'Sammlungen')}</p><h1 class="display">Sammlungen</h1></div>
        <button type="button" class="btn primary" id="new-folder">+ Neue Sammlung</button>
      </section>
      <div class="folder-grid">
        ${p.folders.map((f) => folderCardHTML(f, p.books, folderHref(f.id))).join('')}
        <button type="button" class="folder-card folder-new" id="new-folder-2"><span>+</span>Neue Sammlung</button>
      </div>`;
    const create = () => openFolderModal(null, (f) => { location.hash = folderHref(f.id); });
    view.querySelector('#new-folder').onclick = create;
    view.querySelector('#new-folder-2').onclick = create;
  }

  function viewFolder({ arg: id }) {
    const f = Store.folder(id);
    if (!f) { location.hash = '#/folders'; return; }
    const books = f.bookKeys.map(Store.entry).filter(Boolean);
    const read = books.filter((b) => b.status === 'read').length;

    view.innerHTML = `
      <section class="folder-hero" style="--c:${safeColor(f.color)}">
        <a class="back" href="#/folders">← Sammlungen</a>
        <h1 class="display">${esc(f.name)}</h1>
        ${f.desc ? `<p class="lead">${esc(f.desc)}</p>` : ''}
        <p class="muted">${plural(books.length, 'Buch', 'Bücher')}${books.length ? ` · ${read} gelesen` : ''}</p>
        ${books.length ? `<div class="progress thin"><span style="width:${Math.round((read / books.length) * 100)}%"></span></div>` : ''}
        <div class="hero-actions">
          <button type="button" class="btn primary" id="add">+ Bücher hinzufügen</button>
          <button type="button" class="btn ghost" id="edit">Bearbeiten</button>
          <button type="button" class="btn ghost danger-text" id="del">Löschen</button>
        </div>
      </section>
      ${books.length ? `<div class="grid">${books.map((b) => `
        <div class="card-wrap">${bookCard(b)}<button type="button" class="card-remove" data-rm="${esc(b.key)}" aria-label="Aus Sammlung entfernen" title="Aus Sammlung entfernen">×</button></div>`).join('')}</div>`
        : emptyHTML('Noch leer', 'Füge Bücher aus deiner Bibliothek hinzu oder über die Detailseite eines Buches.')}`;

    view.querySelector('#edit').onclick = () => openFolderModal(f, () => render({ keepScroll: true }));
    view.querySelector('#del').onclick = () => confirmModal('Sammlung löschen?', 'Die Bücher selbst bleiben in deiner Bibliothek.', 'Löschen', () => {
      Store.deleteFolder(f.id);
      toast('Sammlung gelöscht');
      location.hash = '#/folders';
    });
    view.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      Store.toggleInFolder(f.id, b.dataset.rm);
      render({ keepScroll: true });
    });
    view.querySelector('#add').onclick = () => {
      const entries = Store.entries().sort((a, b) => a.title.localeCompare(b.title, 'de'));
      openModal(`<div class="modal-body">
        <p class="eyebrow">${esc(f.name)}</p>
        <h2>Bücher hinzufügen</h2>
        ${entries.length ? `<input type="search" class="input" id="pick-filter" placeholder="Filtern …">
        <div class="picker-list books">${entries.map((e) => `
          <button type="button" class="picker-row ${f.bookKeys.includes(e.key) ? 'on' : ''}" data-key="${esc(e.key)}" data-hay="${esc(`${e.title} ${(e.authors || []).join(' ')}`.toLowerCase())}">
            <span class="mini-cover">${coverHTML(e, 'S')}</span>
            <span class="name">${esc(e.title)}<small>${esc(authorsOf(e))}</small></span>
            <span class="check">✓</span>
          </button>`).join('')}</div>`
        : '<p class="muted">Deine Bibliothek ist noch leer. Finde Bücher über die Suche.</p>'}
        <div class="modal-actions"><a class="btn ghost" href="#/search">Zur Suche</a><button type="button" class="btn primary" data-close>Fertig</button></div>
      </div>`, (root) => {
        root.querySelectorAll('[data-key]').forEach((b) => b.onclick = () => {
          Store.toggleInFolder(f.id, b.dataset.key);
          b.classList.toggle('on');
        });
        root.querySelector('#pick-filter')?.addEventListener('input', (ev) => {
          const q = ev.target.value.trim().toLowerCase();
          root.querySelectorAll('[data-hay]').forEach((r) => { r.hidden = q && !r.dataset.hay.includes(q); });
        });
      });
      modal.addEventListener('close', () => { if (location.hash === folderHref(f.id)) render({ keepScroll: true }); }, { once: true });
    };
  }

  function statsHTML(s, foldersCount) {
    const monthMax = Math.max(1, ...s.months);
    const distMax = Math.max(1, ...s.dist.map((d) => d[1]));
    const monthNames = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const stat = (v, l) => `<div class="stat glass"><strong>${v}</strong><span>${l}</span></div>`;
    return `
      <section class="stats-grid">
        ${stat(s.read, 'Bücher gelesen')}
        ${stat(s.pages.toLocaleString('de-DE'), 'Seiten gelesen')}
        ${stat(fmtAvg(s.avg), 'Ø Bewertung')}
        ${stat(s.reading, 'Gerade am Lesen')}
        ${stat(s.reviews, 'Rezensionen')}
        ${stat(foldersCount, 'Sammlungen')}
      </section>
      <div class="dash-grid">
        <section class="card glass">
          <h2>${s.year} in Monaten</h2>
          <div class="month-chart">${s.months.map((n, i) => `
            <div class="month ${i === new Date().getMonth() ? 'now' : ''}" title="${plural(n, 'Buch', 'Bücher')}">
              <span class="bar-wrap"><span class="bar" style="height:${(n / monthMax) * 100}%">${n ? `<em>${n}</em>` : ''}</span></span>
              <small>${monthNames[i]}</small>
            </div>`).join('')}</div>
        </section>
        <section class="card glass">
          <h2>Sterne</h2>
          <div class="dist">${s.dist.map(([n, c]) => `
            <div class="dist-row"><span>${n} ★</span><span class="dist-bar"><span style="width:${(c / distMax) * 100}%"></span></span><span>${c}</span></div>`).join('')}</div>
        </section>
        <section class="card glass">
          <h2>Stimmungen</h2>
          ${s.moods.length ? `<div class="chips">${s.moods.map(([m, c]) => `<span class="chip active">${esc(m)} <b>${c}</b></span>`).join('')}</div>` : '<p class="muted">Noch keine Stimmungen markiert.</p>'}
        </section>
        <section class="card glass">
          <h2>Meistgelesen</h2>
          ${s.authors.length ? `<ol class="rank">${s.authors.map(([a, c]) => `<li><span>${esc(a)}</span><b>${c}</b></li>`).join('')}</ol>` : '<p class="muted">Noch keine gelesenen Bücher.</p>'}
        </section>
      </div>`;
  }

  function viewProfile() {
    const p = Store.profile();
    const s = computeStats(Store.entries());
    const g = Store.group();

    view.innerHTML = `
      <section class="profile-hero">
        ${avatarHTML(p, 'xl')}
        <div class="profile-id">
          <p class="eyebrow">Liest hier seit ${new Date(p.createdAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p>
          <h1 class="display">${esc(p.name)}</h1>
          ${p.bio ? `<p class="lead">${esc(p.bio)}</p>` : ''}
          <button type="button" class="btn ghost sm" id="edit">Profil bearbeiten</button>
        </div>
        ${ringHTML(s.thisYear, p.goal || 0, `Leseziel ${s.year}`)}
      </section>

      ${statsHTML(s, p.folders.length)}

      <div class="dash-grid">
        <section class="card glass">
          <h2>Konto</h2>
          <p class="muted">Angemeldet als <strong class="email">${esc(Cloud.user()?.email || '')}</strong>. Deine Bibliothek synchronisiert sich automatisch auf all deinen Geräten.</p>
          <div class="hero-actions">
            <a class="btn ghost sm" href="#/circle">❂ ${g ? esc(g.name) : 'Lesekreis'}</a>
            <button type="button" class="btn ghost sm" id="logout">Abmelden</button>
          </div>
        </section>
        <section class="card glass">
          <h2>Daten</h2>
          <p class="muted">Lade dir jederzeit eine Sicherungskopie herunter oder importiere Bücher aus einem Backup.</p>
          <div class="hero-actions">
            <button type="button" class="btn primary sm" id="export">Backup exportieren</button>
            <button type="button" class="btn ghost sm" id="import">Backup importieren</button>
          </div>
          <button type="button" class="btn danger sm" id="del-profile">Profil &amp; Bibliothek löschen</button>
        </section>
      </div>`;

    view.querySelector('#edit').onclick = openProfileModal;
    view.querySelector('#export').onclick = exportBackup;
    view.querySelector('#import').onclick = importBackup;
    view.querySelector('#logout').onclick = signOut;
    view.querySelector('#del-profile').onclick = () => confirmModal(`„${p.name}“ löschen?`, 'Alle Bücher, Bewertungen und Sammlungen werden unwiderruflich gelöscht und du verlässt deinen Lesekreis. Exportiere vorher ein Backup, falls du unsicher bist.', 'Endgültig löschen', async () => {
      try {
        await Store.deleteProfile();
        toast('Profil gelöscht');
        location.hash = '#/';
        render();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    });
  }

  function viewCircle({ isStale }) {
    const g = Store.group();

    if (!g) {
      view.innerHTML = `
        <section class="page-head center">
          <p class="eyebrow">Gemeinsam lesen</p>
          <h1 class="display">Lesekreis</h1>
          <p class="lead">Sieh, was deine Freund:innen gerade lesen, wie sie Bücher bewerten und was sie darüber schreiben.</p>
        </section>
        <div class="dash-grid narrow">
          <form class="card glass" id="join">
            <h2>Beitreten</h2>
            <p class="muted">Du hast einen Einladungscode bekommen?</p>
            <label class="field"><span>Einladungscode</span><input name="code" required maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="z. B. 7F3A9C21B0" class="code-input"></label>
            <button class="btn primary block">Beitreten</button>
          </form>
          <form class="card glass" id="create">
            <h2>Gründen</h2>
            <p class="muted">Starte einen eigenen Kreis und lade bis zu ein paar Freund:innen ein.</p>
            <label class="field"><span>Name des Kreises</span><input name="name" required maxlength="60" placeholder="z. B. Die Nachteulen"></label>
            <button class="btn ghost block">Lesekreis gründen</button>
          </form>
        </div>`;
      const wire = (sel, fn, okMsg) => {
        const form = view.querySelector(sel);
        form.onsubmit = async (ev) => {
          ev.preventDefault();
          const btn = form.querySelector('button');
          btn.disabled = true;
          try {
            await fn(form.elements[0].value.trim());
            toast(okMsg());
            render();
          } catch (err) {
            btn.disabled = false;
            toast(errorText(err), 'error');
          }
        };
      };
      wire('#join', (code) => Store.joinGroup(code), () => `Willkommen in „${Store.group()?.name}“`);
      wire('#create', (name) => Store.createGroup(name), () => 'Lesekreis gegründet – teile jetzt den Code');
      refreshGroupThen(isStale);
      return;
    }

    const me = Store.profile();
    const people = [me, ...Store.members()];
    const shareText = `Komm in meinen Lesekreis „${g.name}“ bei Lesemaus! Einladungscode: ${g.invite_code}${location.protocol.startsWith('http') ? `\n${location.origin}${location.pathname}` : ''}`;

    view.innerHTML = `
      <section class="page-head with-action">
        <div><p class="eyebrow">Lesekreis · ${plural(people.length, 'Mitglied', 'Mitglieder')}</p><h1 class="display">${esc(g.name)}</h1></div>
        <div class="invite glass">
          <span class="muted">Einladungscode</span>
          <code>${esc(g.invite_code)}</code>
          <button type="button" class="btn ghost sm" id="share">${navigator.share ? 'Teilen' : 'Kopieren'}</button>
        </div>
      </section>

      <div class="members">${people.map((m) => {
        const reading = Object.values(m.books || {}).filter((e) => e.status === 'reading').sort(byDesc('updatedAt'))[0];
        const readCount = Object.values(m.books || {}).filter((e) => e.status === 'read').length;
        return `<a class="member glass" href="${m.id === me.id ? '#/profile' : friendHref(m.id)}" style="--c:${safeColor(m.color)}">
          ${avatarHTML(m)}
          <div class="member-info">
            <h3>${esc(m.name)}${m.id === me.id ? ' <small>(du)</small>' : ''}</h3>
            <p class="muted">${plural(readCount, 'Buch', 'Bücher')} gelesen</p>
            ${reading ? `<p class="member-reading">☾ ${esc(reading.title)}</p>` : ''}
          </div>
        </a>`;
      }).join('')}</div>

      <section class="section">
        <header class="section-head"><h2>Was gerade passiert</h2></header>
        <div class="feed">${feedHTML(feedEvents(60), 'Noch keine Aktivität. Füge Bücher hinzu – dein Kreis sieht es hier.')}</div>
      </section>

      <p class="center-note"><button type="button" class="link-btn" id="leave">Lesekreis verlassen</button></p>`;

    view.querySelector('#share').onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Lesemaus', text: shareText });
        else { await navigator.clipboard.writeText(shareText); toast('Einladung kopiert'); }
      } catch (err) {
        if (err?.name !== 'AbortError') toast(`Code: ${g.invite_code}`);
      }
    };
    view.querySelector('#leave').onclick = () => confirmModal('Lesekreis verlassen?', 'Du siehst dann nicht mehr, was die anderen lesen. Mit dem Code kannst du jederzeit zurückkehren.', 'Verlassen', async () => {
      try {
        await Store.leaveGroup();
        toast('Lesekreis verlassen');
        render();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    });

    refreshGroupThen(isStale);
  }

  function viewFriend({ arg: id, params, isStale }) {
    const m = Store.member(id);
    if (!m) {
      if (id === Store.profile().id) { location.hash = '#/profile'; return; }
      view.innerHTML = emptyHTML('Nicht gefunden', 'Diese Person ist nicht (mehr) in deinem Lesekreis.', '<a class="btn ghost" href="#/circle">Zum Lesekreis</a>');
      refreshGroupThen(isStale);
      return;
    }
    const all = Object.values(m.books).filter((e) => e?.key && STATUS[e.status]);
    const s = computeStats(all);
    const folderId = params.get('f');
    const folder = folderId && m.folders.find((f) => f.id === folderId);
    const tabKey = STATUS[params.get('s')] ? params.get('s') : 'read';
    const base = friendHref(m.id);

    if (folder) {
      const books = folder.bookKeys.map((k) => m.books[k]).filter(Boolean);
      view.innerHTML = `
        <section class="folder-hero" style="--c:${safeColor(folder.color)}">
          <a class="back" href="${base}">← ${esc(m.name)}</a>
          <h1 class="display">${esc(folder.name)}</h1>
          ${folder.desc ? `<p class="lead">${esc(folder.desc)}</p>` : ''}
          <p class="muted">Sammlung von ${esc(m.name)} · ${plural(books.length, 'Buch', 'Bücher')}</p>
        </section>
        ${books.length ? `<div class="grid">${books.map((b) => cardHTML(b, b)).join('')}</div>` : emptyHTML('Noch leer', `${esc(m.name)} hat hier noch nichts abgelegt.`)}`;
      refreshGroupThen(isStale);
      return;
    }

    const reading = all.filter((e) => e.status === 'reading').sort(byDesc('updatedAt'));
    const sorted = all.filter((e) => e.status === tabKey).sort(byDesc(tabKey === 'read' ? 'finishedAt' : 'updatedAt'));
    const tab = (k) => `<a class="tab ${tabKey === k ? 'active' : ''}" href="${base}?s=${k}">${STATUS[k].short}<span>${all.filter((e) => e.status === k).length}</span></a>`;

    view.innerHTML = `
      <section class="profile-hero">
        ${avatarHTML(m, 'xl')}
        <div class="profile-id">
          <p class="eyebrow">Im Lesekreis · zuletzt aktiv ${m.updatedAt ? relTime(m.updatedAt) : '–'}</p>
          <h1 class="display">${esc(m.name)}</h1>
          ${m.bio ? `<p class="lead">${esc(m.bio)}</p>` : ''}
        </div>
        ${ringHTML(s.thisYear, m.goal || 0, `Leseziel ${s.year}`)}
      </section>

      ${reading.length ? `<section class="section">
        <header class="section-head"><h2>Liest gerade</h2></header>
        <div class="reading-list">${reading.map((e) => `
          <article class="reading-card glass">
            <a href="${bookHref(e.key)}" class="rc-cover">${coverHTML(e)}</a>
            <div class="rc-body">
              <h3><a href="${bookHref(e.key)}">${esc(e.title)}</a></h3>
              <p class="muted">${esc(authorsOf(e))}</p>
              <div class="progress"><span style="width:${pct(e)}%"></span></div>
              <div class="rc-foot"><span>${e.pages ? `Seite ${num(e.currentPage)} / ${num(e.pages)}` : `Seite ${num(e.currentPage)}`} · <strong>${pct(e)}%</strong></span></div>
              ${e.progressLog?.[0]?.note ? `<blockquote>${esc(truncate(e.progressLog[0].note, 200))}</blockquote>` : ''}
            </div>
          </article>`).join('')}</div>
      </section>` : ''}

      ${m.folders.length ? `<section class="section">
        <header class="section-head"><h2>Sammlungen</h2></header>
        <div class="folder-grid">${m.folders.map((f) => folderCardHTML(f, m.books, `${base}?f=${encodeURIComponent(f.id)}`)).join('')}</div>
      </section>` : ''}

      <section class="section">
        <header class="section-head"><h2>Bibliothek</h2></header>
        <nav class="tabs">${['read', 'reading', 'want', 'dnf'].map(tab).join('')}</nav>
        ${sorted.length ? `<div class="grid">${sorted.map((e) => cardHTML(e, e)).join('')}</div>` : `<p class="muted">Hier ist noch nichts.</p>`}
      </section>

      <section class="section">
        <header class="section-head"><h2>Statistik</h2></header>
        ${statsHTML(s, m.folders.length)}
      </section>`;

    refreshGroupThen(isStale);
  }

  // ---------- Router ----------
  function renderTopbar(active, q) {
    const p = Store.profile();
    topbar.hidden = !p;
    if (!p) return;
    const link = (href, k, label, icon) => `<a href="${href}" class="${active === k ? 'active' : ''}"><span class="nav-icon">${icon}</span><span>${label}</span></a>`;
    topbar.innerHTML = `
      <a class="logo" href="#/"><span class="logo-moon">☾</span><span>Lesemaus</span></a>
      <nav class="nav">
        ${link('#/', 'home', 'Start', '☾')}
        ${link('#/search', 'search', 'Entdecken', '✧')}
        ${link('#/library', 'library', 'Bibliothek', '❦')}
        ${link('#/folders', 'folders', 'Sammlungen', '✦')}
        ${link('#/circle', 'circle', 'Lesekreis', '❂')}
      </nav>
      <form class="top-search" role="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input type="search" name="q" placeholder="Bücher suchen …" value="${esc(q)}" aria-label="Bücher suchen">
      </form>
      <a class="avatar-btn ${active === 'profile' ? 'active' : ''}" href="#/profile" title="Profil">${avatarHTML(p, 'sm')}</a>`;
    const form = topbar.querySelector('form');
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const v = form.elements.q.value.trim();
      if (v) location.hash = `#/search?q=${encodeURIComponent(v)}`;
    };
  }

  const VIEWS = {
    home: viewHome, search: viewSearch, book: viewBook, library: viewLibrary, folders: viewFolders,
    folder: viewFolder, profile: viewProfile, circle: viewCircle, friend: viewFriend,
  };
  const NAV_OF = { folder: 'folders', friend: 'circle' };

  let token = 0;
  function render(opts = {}) {
    const t = ++token;
    const isStale = () => t !== token;
    const [path, qs] = (location.hash.slice(1) || '/').split('?');
    const [name = 'home', arg] = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs);
    const y = window.scrollY;

    closeModal();
    renderTopbar(NAV_OF[name] || name, name === 'search' ? params.get('q') || '' : '');

    if (!Cloud.configured) viewSetup();
    else if (!Cloud.user()) viewAuth();
    else if (!Store.profile()) viewOnboarding();
    else {
      let decoded = arg;
      try { decoded = arg && decodeURIComponent(arg); } catch { /* keep raw */ }
      (VIEWS[name] || viewHome)({ arg: decoded, params, isStale });
    }

    window.scrollTo({ top: opts.keepScroll ? y : 0, behavior: 'instant' });
    if (!opts.keepScroll) {
      view.classList.remove('enter');
      void view.offsetWidth;
      view.classList.add('enter');
    }
  }

  // ---------- Global wiring ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-progress]');
    if (btn) {
      e.preventDefault();
      openProgressModal(btn.dataset.progress, () => render({ keepScroll: true }));
    }
  });

  // Missing covers: Open Library returns 404 with ?default=false – reveal the generated fallback instead.
  const dropBrokenCover = (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.closest('.cover') && (e.type === 'error' || img.naturalWidth < 10)) img.remove();
  };
  document.addEventListener('error', dropBrokenCover, true);
  document.addEventListener('load', dropBrokenCover, true);

  Store.onError(() => toast('Speichern fehlgeschlagen – neuer Versuch läuft …', 'error'));

  document.addEventListener('visibilitychange', () => {
    if (!Store.profile()) return;
    if (document.visibilityState === 'hidden') { Store.flush(); return; }
    Promise.all([Store.syncFromCloud(), Store.refreshGroup()])
      .then(([mine, group]) => { if ((mine || group) && !modal.open) render({ keepScroll: true }); })
      .catch(() => {});
  });

  window.addEventListener('beforeunload', (e) => {
    if (Store.pending()) { Store.flush(); e.preventDefault(); e.returnValue = ''; }
  });

  const motes = document.getElementById('motes');
  for (let i = 0; i < 38; i++) {
    const m = document.createElement('span');
    m.style.cssText = `--x:${Math.random() * 100}vw;--d:${16 + Math.random() * 24}s;--delay:${-Math.random() * 40}s;--s:${1 + Math.random() * 2.5}px;--o:${0.2 + Math.random() * 0.5};--drift:${(Math.random() - 0.5) * 140}px`;
    motes.append(m);
  }

  let booted = false;
  async function boot() {
    if (Cloud.configured) {
      view.innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';
      try {
        await Cloud.restore();
        if (Cloud.user()) await Store.load();
      } catch (err) {
        view.innerHTML = emptyHTML('Keine Verbindung',
          'Die Datenbank ist gerade nicht erreichbar. Prüfe deine Internetverbindung. Falls das Supabase-Projekt pausiert wurde, aktiviere es im Dashboard wieder.',
          '<button type="button" class="btn primary" id="retry">Erneut versuchen</button>');
        view.querySelector('#retry').onclick = boot;
        return;
      }
    }
    booted = true;
    render();
  }

  window.addEventListener('hashchange', () => { if (booted) render(); });
  boot();
})();
