const Store = (() => {
  let me = null;
  let group = null;
  let members = [];
  let dirty = false;
  let timer = null;
  let saving = null;
  let onError = () => {};

  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const now = () => new Date().toISOString();

  function fromRow(r) {
    const d = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      id: r.id, name: r.name, bio: r.bio || '', avatar: r.avatar, color: r.color, goal: r.goal,
      groupId: r.group_id, createdAt: r.created_at, updatedAt: r.updated_at,
      books: d.books && typeof d.books === 'object' && !Array.isArray(d.books) ? d.books : {},
      folders: Array.isArray(d.folders) ? d.folders : [],
    };
  }

  const toRow = (p) => ({
    name: p.name, bio: p.bio, avatar: p.avatar, color: p.color, goal: p.goal,
    data: { books: p.books, folders: p.folders },
  });

  // ---------- Sync ----------
  async function load() {
    const row = await Cloud.fetchMe();
    me = row ? fromRow(row) : null;
    if (me) await refreshGroup();
  }

  function reset() {
    clearTimeout(timer);
    me = null; group = null; members = []; dirty = false;
  }

  function save() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }

  async function flush() {
    clearTimeout(timer);
    if (saving) await saving;
    if (!dirty || !me) return;
    dirty = false;
    const stamp = now();
    saving = Cloud.updateMe({ ...toRow(me), updated_at: stamp })
      .then(() => { me.updatedAt = stamp; })
      .catch((err) => {
        dirty = true;
        timer = setTimeout(flush, 5000);
        onError(err);
      })
      .finally(() => { saving = null; });
    await saving;
  }

  // Pull changes made on another device, unless local edits are still pending.
  async function syncFromCloud() {
    if (!me || dirty || saving) return false;
    const row = await Cloud.fetchMe();
    if (!row || dirty || saving || row.updated_at === me.updatedAt) return false;
    me = fromRow(row);
    return true;
  }

  async function refreshGroup() {
    if (!me) return false;
    const sig = () => JSON.stringify([group?.id, group?.name, members.map((m) => m.id + m.updatedAt)]);
    const before = sig();
    const { group: g, profiles } = await Cloud.fetchGroup();
    group = g;
    const self = profiles.find((p) => p.id === me.id);
    if (self) me.groupId = self.group_id;
    members = g ? profiles.filter((p) => p.id !== me.id && p.group_id === g.id).map(fromRow) : [];
    return before !== sig();
  }

  // ---------- Profile ----------
  const profile = () => me;

  async function createProfile(data) {
    me = fromRow(await Cloud.insertMe({ ...data, data: { books: {}, folders: [] } }));
    await refreshGroup();
    return me;
  }

  function updateProfile(patch) {
    Object.assign(me, patch);
    save();
  }

  async function deleteProfile() {
    clearTimeout(timer);
    dirty = false;
    await Cloud.deleteMe();
    reset();
  }

  // ---------- Group ----------
  const getGroup = () => group;
  const getMembers = () => members;
  const member = (id) => members.find((m) => m.id === id) || null;

  async function createGroup(name) { await Cloud.createGroup(name); await refreshGroup(); }
  async function joinGroup(code) { await Cloud.joinGroup(code); await refreshGroup(); }
  async function leaveGroup() { await Cloud.leaveGroup(); await refreshGroup(); }

  // ---------- Books ----------
  const entry = (key) => me?.books[key] || null;
  const entries = () => Object.values(me?.books || {});

  function applyPatch(e, patch) {
    if (patch.status && patch.status !== e.status) {
      if (patch.status === 'reading' && !e.startedAt) e.startedAt = now();
      if (patch.status === 'read') {
        e.finishedAt = now();
        e.startedAt = e.startedAt || e.finishedAt;
        if (e.pages) e.currentPage = e.pages;
      } else {
        e.finishedAt = null;
      }
    }
    Object.assign(e, patch, { updatedAt: now() });
  }

  function upsertBook(book, patch = {}) {
    let e = me.books[book.key];
    if (!e) {
      e = {
        key: book.key,
        title: book.title,
        authors: book.authors || [],
        coverId: book.coverId || null,
        year: book.year || null,
        pages: book.pages || null,
        status: 'want',
        rating: 0,
        review: '',
        moods: [],
        currentPage: 0,
        progressLog: [],
        startedAt: null,
        finishedAt: null,
        addedAt: now(),
        updatedAt: now(),
      };
      me.books[book.key] = e;
    }
    applyPatch(e, patch);
    save();
    return e;
  }

  function updateBook(key, patch) {
    const e = entry(key);
    if (!e) return null;
    applyPatch(e, patch);
    save();
    return e;
  }

  function removeBook(key) {
    delete me.books[key];
    me.folders.forEach((f) => { f.bookKeys = f.bookKeys.filter((k) => k !== key); });
    save();
  }

  function logProgress(key, page, note) {
    const e = entry(key);
    if (!e) return;
    const clamped = e.pages ? Math.min(page, e.pages) : page;
    e.progressLog.unshift({ id: uid(), date: now(), page: clamped, note });
    e.currentPage = clamped;
    if (e.status === 'want' || e.status === 'dnf') applyPatch(e, { status: 'reading' });
    e.updatedAt = now();
    save();
  }

  function removeLog(key, logId) {
    const e = entry(key);
    if (!e) return;
    e.progressLog = e.progressLog.filter((l) => l.id !== logId);
    e.currentPage = e.progressLog[0]?.page ?? 0;
    save();
  }

  // ---------- Folders ----------
  const folder = (id) => me?.folders.find((f) => f.id === id) || null;

  function createFolder(data) {
    const f = { id: uid(), createdAt: now(), bookKeys: [], ...data };
    me.folders.push(f);
    save();
    return f;
  }

  function updateFolder(id, patch) {
    const f = folder(id);
    Object.assign(f, patch);
    save();
    return f;
  }

  function deleteFolder(id) {
    me.folders = me.folders.filter((f) => f.id !== id);
    save();
  }

  function toggleInFolder(folderId, key) {
    const f = folder(folderId);
    const has = f.bookKeys.includes(key);
    f.bookKeys = has ? f.bookKeys.filter((k) => k !== key) : [...f.bookKeys, key];
    save();
    return !has;
  }

  // ---------- Backup ----------
  const exportData = () => JSON.stringify({
    app: 'lesemaus', version: 2, exportedAt: now(),
    profile: { name: me.name, bio: me.bio, avatar: me.avatar, color: me.color, goal: me.goal, books: me.books, folders: me.folders },
  }, null, 2);

  // Accepts v2 exports and the older local multi-profile format.
  function importData(json) {
    const data = JSON.parse(json);
    const src = data?.profile || Object.values(data?.profiles || {})[0];
    if (!src || typeof src.books !== 'object' || !Array.isArray(src.folders)) throw new Error('Ungültige Datei');
    let count = 0;
    for (const [key, e] of Object.entries(src.books)) {
      if (!e || typeof e.title !== 'string' || e.key !== key) continue;
      me.books[key] = { progressLog: [], moods: [], authors: [], ...e };
      count++;
    }
    const known = new Set(me.folders.map((f) => f.id));
    src.folders
      .filter((f) => f && typeof f.name === 'string' && Array.isArray(f.bookKeys) && !known.has(f.id))
      .forEach((f) => me.folders.push({ ...f, id: f.id || uid() }));
    save();
    return count;
  }

  return {
    load, reset, flush, syncFromCloud, refreshGroup,
    pending: () => dirty || !!saving,
    onError: (fn) => { onError = fn; },
    profile, createProfile, updateProfile, deleteProfile,
    group: getGroup, members: getMembers, member, createGroup, joinGroup, leaveGroup,
    entry, entries, upsertBook, updateBook, removeBook, logProgress, removeLog,
    folder, createFolder, updateFolder, deleteFolder, toggleInFolder,
    exportData, importData,
  };
})();
