// Open Library API (https://openlibrary.org/developers/api) – free, no key required.
const API = (() => {
  const BASE = 'https://openlibrary.org';
  const cache = new Map();

  const workId = (key) => String(key).split('/').pop();

  function fromDoc(d) {
    return {
      key: workId(d.key),
      title: d.title || 'Unbekannter Titel',
      authors: d.author_name || [],
      coverId: d.cover_i || null,
      year: d.first_publish_year || null,
      pages: d.number_of_pages_median || null,
      subjects: (d.subject || []).slice(0, 10),
    };
  }

  function remember(books) {
    books.forEach((b) => cache.set(b.key, { ...cache.get(b.key), ...b }));
    return books;
  }

  async function getJSON(url, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function search(query, signal) {
    const fields = 'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject';
    const data = await getJSON(`${BASE}/search.json?q=${encodeURIComponent(query)}&limit=30&fields=${fields}`, signal);
    return remember(data.docs.filter((d) => d.key?.startsWith('/works/')).map(fromDoc));
  }

  async function trending(signal) {
    const data = await getJSON(`${BASE}/trending/weekly.json?limit=24`, signal);
    return remember((data.works || []).filter((d) => d.key?.startsWith('/works/')).map(fromDoc));
  }

  function cleanDescription(text) {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\[\d+\]:.*$/gm, '')
      .split(/\n-{3,}/)[0]
      .replace(/\(\[source\]\[\d+\]\)/gi, '')
      .replace(/(\*{1,3}|_{2})(\S[^*_]*?)\1/g, '$2')
      .trim();
  }

  async function work(id) {
    const cached = cache.get(id);
    if (cached?.full) return cached;

    let w = await getJSON(`${BASE}/works/${encodeURIComponent(id)}.json`);
    for (let i = 0; i < 3 && w.type?.key === '/type/redirect' && w.location?.startsWith('/works/'); i++) {
      w = await getJSON(`${BASE}${w.location}.json`);
    }

    let authors = cached?.authors;
    if (!authors?.length) {
      const keys = (w.authors || []).map((a) => a.author?.key).filter(Boolean).slice(0, 4);
      authors = (await Promise.all(
        keys.map((k) => getJSON(`${BASE}${k}.json`).then((a) => a.name).catch(() => null)),
      )).filter(Boolean);
    }

    let pages = cached?.pages;
    if (!pages) {
      try {
        const eds = await getJSON(`${BASE}/works/${encodeURIComponent(id)}/editions.json?limit=30`);
        const p = (eds.entries || []).map((e) => e.number_of_pages).filter((n) => n > 0).sort((a, b) => a - b);
        if (p.length) pages = p[Math.floor(p.length / 2)];
      } catch { /* pages stay unknown, user can enter them */ }
    }

    const desc = typeof w.description === 'string' ? w.description : w.description?.value || '';
    const yearMatch = String(w.first_publish_date || '').match(/\d{4}/);

    const result = {
      key: id,
      title: w.title || cached?.title || 'Unbekannter Titel',
      authors,
      coverId: cached?.coverId || (w.covers || []).find((c) => c > 0) || null,
      year: cached?.year || (yearMatch ? Number(yearMatch[0]) : null),
      pages: pages || null,
      subjects: (w.subjects || cached?.subjects || []).slice(0, 10),
      description: cleanDescription(desc),
      full: true,
    };
    cache.set(id, result);
    return result;
  }

  function cover(id, size = 'M') {
    const n = parseInt(id, 10);
    return n > 0 ? `https://covers.openlibrary.org/b/id/${n}-${size}.jpg?default=false` : null;
  }

  return { search, trending, work, cover };
})();
