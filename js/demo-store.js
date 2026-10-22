// Demo mode: everything is saved in this browser (IndexedDB). No Google needed.
import { uid } from './util.js';

const DB_NAME = 'myblog-demo';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('media');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const r = fn(t.objectStore(storeName));
    t.oncomplete = () => { resolve(r?.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

function welcomePosts() {
  const now = Date.now();
  return [
    {
      id: uid(), type: 'note', visibility: 'private', title: '',
      body: "This is **Demo mode** — posts are saved only in this browser.\n\nTry writing a thought, adding photos or a video, or saving a link. When you're ready, follow **SETUP.md** to connect your Google Drive.",
      tags: ['welcome'], media: [], createdAt: new Date(now - 60000).toISOString(), updatedAt: new Date(now - 60000).toISOString(),
    },
    {
      id: uid(), type: 'link', visibility: 'public', title: 'A walk through the Northern Lights',
      body: 'Saving this to watch later.',
      link: { url: 'https://www.youtube.com/watch?v=izs9nHzi2G4', title: 'Northern Lights timelapse' },
      tags: ['nature', 'watch-later'], media: [], createdAt: new Date(now - 3600e3 * 5).toISOString(), updatedAt: new Date(now - 3600e3 * 5).toISOString(),
    },
    {
      id: uid(), type: 'thought', visibility: 'public', title: 'Hello, world',
      body: "First post on my new blog. I can write in *Markdown*:\n\n- lists\n- **bold** and _italic_\n- [links](https://github.com)\n\n> and quotes, too.",
      tags: ['hello'], media: [], createdAt: new Date(now - 86400e3 * 2).toISOString(), updatedAt: new Date(now - 86400e3 * 2).toISOString(),
    },
  ];
}

export class DemoStore {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = 'demo';
    this.user = { name: 'You (demo)', email: '', photo: '' };
    this.urls = new Map();
  }
  get signedIn() { return true; }
  get isOwner() { return true; }
  tokenValid() { return true; }
  requestToken() { return Promise.resolve(); }
  async init() {}

  async loadPosts() {
    let data = await tx('kv', 'readonly', s => s.get('posts'));
    if (!data) {
      data = { version: 1, posts: welcomePosts() };
      await tx('kv', 'readwrite', s => s.put(data, 'posts'));
    }
    this.settings = data.settings || {};
    return data.posts || [];
  }
  lastfmUser() { return this.settings?.lastfm?.user || ''; }
  async savePosts(posts) {
    for (const p of posts) for (const m of p.media || []) m.shared = p.visibility === 'public';
    await tx('kv', 'readwrite', s => s.put({ version: 1, settings: this.settings || {}, posts }, 'posts'));
  }
  mutate(fn) {
    const run = async () => {
      const posts = await this.loadPosts();
      const out = (await fn(posts, this.settings)) || posts;
      await this.savePosts(out);
      return out;
    };
    const next = (this.queue || Promise.resolve()).then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async uploadMedia(file, onProgress) {
    const id = 'demo_' + uid();
    onProgress?.(0.3);
    await tx('media', 'readwrite', s => s.put(file, id));
    onProgress?.(1);
    return { id, name: file.name, mimeType: file.type, size: file.size };
  }
  async blobUrl(id) {
    if (!this.urls.has(id)) {
      this.urls.set(id, tx('media', 'readonly', s => s.get(id)).then(b => {
        if (!b) throw new Error('missing');
        return URL.createObjectURL(b);
      }));
    }
    return this.urls.get(id);
  }
  imageUrl(m) { return this.blobUrl(m.id); }
  videoSrc() { return null; }
  videoBlobUrl(m) { return this.blobUrl(m.id); }
  videoPreviewUrl() { return ''; }
  fallbackImageUrl() { return ''; }
  async trashMedia(ids) {
    for (const id of ids) await tx('media', 'readwrite', s => s.delete(id));
  }
  async clearAll() {
    await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = res; r.onerror = rej; r.onblocked = res; });
  }
  info() { return { mode: 'demo' }; }
}
