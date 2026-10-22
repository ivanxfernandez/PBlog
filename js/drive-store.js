// Google Drive storage + Google sign-in.
//
// Layout in the owner's Drive (folder "My Blog", created by the app):
//   posts.json          every post (private)
//   public-posts.json   only Public posts, shared "anyone with the link" so visitors can read it
//   <media files>       photos/videos; shared publicly only while their post is Public
//
// Scope is drive.file: the app can only see files it created itself.
import { uid } from './util.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'myblog.token';
const EMAIL_KEY = 'myblog.email';

export class AuthError extends Error {
  constructor() { super('Your Google session expired. Sign in again to continue.'); this.name = 'AuthError'; }
}

function waitForGis(timeout = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
      setTimeout(check, 100);
    })();
  });
}

async function runLimited(jobs, limit = 4) {
  let i = 0;
  const worker = async () => { while (i < jobs.length) await jobs[i++](); };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

export class DriveStore {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = 'drive';
    this.token = null;
    this.exp = 0;
    this.user = null;
    this.ownerOk = false;
    this.ids = {};
    this.urls = new Map();
    this.publicMeta = null;
  }

  get signedIn() { return !!this.user; }
  get isOwner() { return this.signedIn && this.ownerOk; }
  tokenValid() { return !!this.token && Date.now() < this.exp; }

  async init() {
    try {
      const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (s && s.exp > Date.now() + 60000) { this.token = s.token; this.exp = s.exp; }
    } catch {}
    this.gisReady = waitForGis().then(() => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.cfg.googleClientId, scope: SCOPE, callback: () => {},
      });
    }).catch(e => { this.gisError = e; });
    if (this.tokenValid()) {
      try { await this.afterSignIn(); } catch (e) { console.warn(e); this.clearSession(); }
    }
  }

  // Must be called directly from a click/tap handler (opens Google's pop-up).
  requestToken() {
    if (!this.tokenClient) {
      return Promise.reject(this.gisError || new Error('Google sign-in is still loading — try again in a moment.'));
    }
    this.pendingReject?.(new Error('Sign-in was restarted.'));
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.tokenClient.callback = r => {
        this.pendingReject = null;
        if (r.error) return reject(new Error(r.error_description || r.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
          return reject(new Error('Please tick the Google Drive box so the blog can save your posts.'));
        }
        this.token = r.access_token;
        this.exp = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: this.token, exp: this.exp })); } catch {}
        resolve();
      };
      this.tokenClient.error_callback = e => {
        this.pendingReject = null;
        const t = e?.type;
        reject(new Error(
          t === 'popup_closed' ? 'The Google sign-in window was closed.' :
          t === 'popup_failed_to_open' ? 'The sign-in pop-up was blocked. Allow pop-ups for this site and try again.' :
          e?.message || 'Google sign-in failed.'));
      };
      let hint;
      try { hint = this.user?.email || localStorage.getItem(EMAIL_KEY) || undefined; } catch {}
      this.tokenClient.requestAccessToken({ prompt: '', login_hint: hint });
    });
  }

  signIn() {
    return this.requestToken().then(() => this.afterSignIn());
  }

  async afterSignIn() {
    const about = await this.api('/about?fields=user(displayName,emailAddress,photoLink)');
    const u = about.user || {};
    this.user = { name: u.displayName || u.emailAddress || 'Me', email: u.emailAddress || '', photo: u.photoLink || '' };
    try { localStorage.setItem(EMAIL_KEY, this.user.email); } catch {}
    const owner = (this.cfg.ownerEmail || '').trim().toLowerCase();
    this.ownerOk = !owner || owner === this.user.email.toLowerCase();
    if (this.ownerOk) await this.ensureFiles();
  }

  clearSession() {
    this.token = null; this.exp = 0; this.user = null; this.ownerOk = false; this.ids = {};
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  }

  signOut() {
    this.clearSession();
    for (const p of this.urls.values()) p.then(u => URL.revokeObjectURL(u)).catch(() => {});
    this.urls.clear();
  }

  // ── Drive REST helpers ──────────────────────────────────────
  async api(path, { method = 'GET', body, headers = {}, raw = false, base = API } = {}) {
    if (!this.tokenValid()) throw new AuthError();
    const opts = { method, headers: { Authorization: `Bearer ${this.token}`, ...headers }, cache: 'no-store' };
    if (body !== undefined) {
      if (body instanceof Blob || typeof body === 'string') opts.body = body;
      else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json; charset=UTF-8'; }
    }
    const res = await fetch(base + path, opts);
    if (res.status === 401) { this.token = null; this.exp = 0; try { sessionStorage.removeItem(TOKEN_KEY); } catch {} throw new AuthError(); }
    if (!res.ok) {
      let msg = `Google Drive error ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    if (raw) return res;
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  async findOne(q) {
    const r = await this.api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=5&orderBy=createdTime`);
    return r?.files?.[0] || null;
  }

  async ensureFiles() {
    let folder = await this.findOne("appProperties has { key='myblog' and value='root' } and trashed=false");
    if (!folder) {
      folder = await this.api('/files?fields=id', {
        method: 'POST',
        body: { name: 'My Blog', mimeType: 'application/vnd.google-apps.folder', appProperties: { myblog: 'root' } },
      });
    }
    this.ids.folder = folder.id;
    const inFolder = role => `'${folder.id}' in parents and appProperties has { key='myblog' and value='${role}' } and trashed=false`;

    let posts = await this.findOne(inFolder('posts'));
    if (!posts) posts = await this.createJson('posts.json', { version: 1, posts: [] }, 'posts');
    this.ids.posts = posts.id;

    let pub = await this.findOne(inFolder('public'));
    if (!pub) pub = await this.createJson('public-posts.json', { version: 1, posts: [] }, 'public');
    this.ids.public = pub.id;
    await this.share(pub.id, true); // harmless to repeat; fixes a failed first attempt
  }

  createJson(name, data, role) {
    const meta = { name, mimeType: 'application/json', parents: [this.ids.folder], appProperties: { myblog: role } };
    const b = 'myblog' + uid();
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data)}\r\n--${b}--`;
    return this.api('/files?uploadType=multipart&fields=id', {
      method: 'POST', base: UPLOAD, body, headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    });
  }

  writeJson(id, data) {
    return this.api(`/files/${id}?uploadType=media&fields=id`, {
      method: 'PATCH', base: UPLOAD,
      body: new Blob([JSON.stringify(data)], { type: 'application/json' }),
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    });
  }

  async readJson(id) {
    const d = await this.api(`/files/${id}?alt=media`);
    return typeof d === 'string' ? JSON.parse(d) : d;
  }

  async share(id, on) {
    try {
      if (on) {
        await this.api(`/files/${id}/permissions?fields=id`, { method: 'POST', body: { type: 'anyone', role: 'reader' } });
      } else {
        const r = await this.api(`/files/${id}/permissions?fields=permissions(id,type)`);
        for (const p of r?.permissions || []) {
          if (p.type === 'anyone') await this.api(`/files/${id}/permissions/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
        }
      }
    } catch (e) {
      if (e.status !== 404) throw e; // file no longer exists — nothing to do
    }
  }

  // ── Posts ───────────────────────────────────────────────────
  async loadPosts() {
    if (this.isOwner) {
      const d = await this.readJson(this.ids.posts);
      this.settings = d?.settings && typeof d.settings === 'object' ? d.settings : {};
      return Array.isArray(d?.posts) ? d.posts : [];
    }
    return this.loadPublic();
  }

  // Last.fm username to show: the owner's own setting, or for visitors only if the owner made it public.
  lastfmUser() {
    if (this.isOwner) return this.settings?.lastfm?.user || '';
    return this.publicMeta?.lastfm?.user || '';
  }

  async loadPublic() {
    const id = this.cfg.publicIndexFileId, key = this.cfg.googleApiKey;
    if (!id || !key) return [];
    const res = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Couldn't load posts (error ${res.status}). Check googleApiKey and publicIndexFileId in js/config.js.`);
    const d = await res.json();
    this.publicMeta = d;
    return Array.isArray(d?.posts) ? d.posts : [];
  }

  async savePosts(posts) {
    // Media is public only while its post is public.
    const jobs = [], newlyShared = [];
    for (const p of posts) {
      const want = p.visibility === 'public';
      for (const m of p.media || []) {
        if (!!m.shared !== want) jobs.push(async () => {
          if (want) newlyShared.push(m);
          await this.share(m.id, want);
          m.shared = want;
        });
      }
    }
    const now = new Date().toISOString();
    try {
      await runLimited(jobs, 4);
      await this.writeJson(this.ids.posts, { version: 1, updatedAt: now, settings: this.settings || {}, posts });
    } catch (e) {
      // Nothing was saved: take back any sharing we just did so private photos stay private.
      await runLimited(newlyShared.map(m => async () => {
        try { await this.share(m.id, false); m.shared = false; } catch {}
      }), 4);
      throw e;
    }
    await this.writeJson(this.ids.public, {
      version: 1, updatedAt: now, blogTitle: this.cfg.blogTitle,
      author: { name: this.user?.name || '', photo: this.user?.photo || '' },
      // Only included when the owner turned on "Show on my public blog".
      lastfm: this.settings?.lastfm?.public && this.settings.lastfm.user ? { user: this.settings.lastfm.user } : null,
      posts: posts.filter(p => p.visibility === 'public'),
    });
  }

  // Load the latest copy from Drive, change it, save it (safe across devices).
  // Saves run one at a time so quick taps can't overwrite each other.
  mutate(fn) {
    const run = async () => {
      const posts = await this.loadPosts();
      this.settings ||= {};
      const out = (await fn(posts, this.settings)) || posts; // fn may also change settings
      await this.savePosts(out);
      return out;
    };
    const next = (this.queue || Promise.resolve()).then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  // ── Media ───────────────────────────────────────────────────
  async uploadMedia(file, onProgress) {
    if (!this.tokenValid()) throw new AuthError();
    const meta = { name: file.name, parents: [this.ids.folder], appProperties: { myblog: 'media' } };
    const type = file.type || 'application/octet-stream';
    const fields = 'fields=id,name,mimeType,size';
    let location = null, res = null;
    try {
      res = await fetch(`${UPLOAD}/files?uploadType=resumable&${fields}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type },
        body: JSON.stringify(meta),
      });
    } catch { /* network/CORS problem — try the simple upload below */ }
    if (res) {
      if (res.status === 401) throw new AuthError();
      if (!res.ok) {
        let msg = `Upload failed (error ${res.status}).`;
        try { const j = await res.json(); if (j.error?.message) msg = `Upload failed: ${j.error.message}`; } catch {}
        throw new Error(msg);
      }
      location = res.headers.get('Location');
    }

    if (location) return this.xhr('PUT', location, file, { 'Content-Type': type }, onProgress);

    // Fallback: one-shot multipart upload
    const b = 'myblog' + uid();
    const body = new Blob([
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n`,
      file, `\r\n--${b}--`,
    ]);
    return this.xhr('POST', `${UPLOAD}/files?uploadType=multipart&${fields}`, body,
      { Authorization: `Bearer ${this.token}`, 'Content-Type': `multipart/related; boundary=${b}` }, onProgress);
  }

  xhr(method, url, body, headers, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
      x.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { try { resolve(JSON.parse(x.responseText)); } catch { resolve({}); } }
        else if (x.status === 401) reject(new AuthError());
        else {
          let msg = `Upload failed (error ${x.status}).`;
          try { const j = JSON.parse(x.responseText); if (j.error?.message) msg = `Upload failed: ${j.error.message}`; } catch {}
          reject(new Error(msg));
        }
      };
      x.onerror = () => reject(new Error('Upload failed — check your connection.'));
      x.send(body);
    });
  }

  publicUrl(id) {
    return `${API}/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(this.cfg.googleApiKey)}`;
  }

  blobUrl(id) {
    if (!this.urls.has(id)) {
      const p = this.api(`/files/${id}?alt=media`, { raw: true }).then(r => r.blob()).then(b => URL.createObjectURL(b));
      p.catch(() => this.urls.delete(id));
      this.urls.set(id, p);
    }
    return this.urls.get(id);
  }

  // Images: visitors use the public link; the owner downloads with their sign-in.
  imageUrl(m) {
    if (!this.isOwner) return Promise.resolve(this.publicUrl(m.id));
    return this.blobUrl(m.id);
  }
  // Videos stream straight from Drive when public; private ones load on tap.
  videoSrc(m) {
    if (!this.isOwner || (m.shared && this.cfg.googleApiKey)) return this.publicUrl(m.id);
    return null;
  }
  videoBlobUrl(m) { return this.blobUrl(m.id); }
  // Over ~100 MB, use Drive's own player (works when this browser is signed in to Google)
  // instead of downloading the whole file into memory.
  videoPreviewUrl(m) {
    return this.isOwner && (m.size || 0) > 100 * 1024 * 1024 ? `https://drive.google.com/file/d/${encodeURIComponent(m.id)}/preview` : '';
  }
  fallbackImageUrl(m) { return `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.id)}&sz=w2000`; }

  async trashMedia(ids) {
    await runLimited(ids.map(id => async () => {
      try {
        await this.share(id, false);
        await this.api(`/files/${id}?fields=id`, { method: 'PATCH', body: { trashed: true } });
      }
      catch (e) { if (e.status !== 404) console.warn(e); }
    }), 4);
  }

  info() {
    return {
      mode: 'drive',
      folderUrl: this.ids.folder ? `https://drive.google.com/drive/folders/${this.ids.folder}` : '',
      publicIndexFileId: this.ids.public || '',
      configured: !!this.ids.public && this.cfg.publicIndexFileId === this.ids.public,
      hasApiKey: !!this.cfg.googleApiKey,
    };
  }
}
