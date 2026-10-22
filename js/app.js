import { DriveStore, AuthError } from './drive-store.js';
import { DemoStore } from './demo-store.js';
import { startLastfm, refreshLastfm, nowPlayingHtml, lookupUser, lastfmAvailable } from './lastfm.js';
import { $, $$, esc, uid, md, safeUrl, hostOf, videoEmbed, fmtDate, fmtSize, parseTags, shrinkImage, toast, icon, GOOGLE_G } from './util.js';

const cfg = Object.assign({ blogTitle: 'My Blog', tagline: '' }, window.BLOG_CONFIG || {});
const demo = !cfg.googleClientId || new URLSearchParams(location.search).has('demo');
const store = demo ? new DemoStore(cfg) : new DriveStore(cfg);

const TYPES = {
  thought: { label: 'Thought', plural: 'Thoughts', placeholder: 'Write your thoughts…' },
  photo: { label: 'Photo', plural: 'Photos', placeholder: 'Say something about these photos…' },
  video: { label: 'Video', plural: 'Videos', placeholder: 'Describe the video…' },
  link: { label: 'Link', plural: 'Links', placeholder: 'Why are you saving this?' },
  note: { label: 'Note', plural: 'Notes', placeholder: 'Jot down a quick note…' },
};

const state = { posts: [], media: new Map(), loading: true, error: '', type: 'all', q: '', tag: '', vis: 'all' };
const main = $('#main');

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  document.title = cfg.blogTitle;
  $('#brand-title').textContent = cfg.blogTitle;
  $('#brand-tag').textContent = cfg.tagline || '';
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').firstChild && !comp?.busy) closeModal(); });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  renderChrome();
  render();
  startLastfm(cfg, () => store.lastfmUser?.() || '', renderNowPlaying);
  try { await store.init(); } catch (e) { console.warn(e); }
  renderChrome();
  await refresh();
}

async function refresh() {
  state.loading = true; state.error = '';
  render();
  try { setPosts(await store.loadPosts()); refreshLastfm(); }
  catch (e) { console.error(e); state.error = e.message || String(e); if (e instanceof AuthError) authExpired(); }
  state.loading = false;
  renderChrome();
  render();
}

function setPosts(posts) {
  state.posts = [...posts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  state.media = new Map();
  for (const p of state.posts) for (const m of p.media || []) state.media.set(m.id, m);
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── Header, banner, footer, floating button ───────────────────
function renderChrome() {
  const owner = store.isOwner;
  let h = `<button class="icon-btn" data-act="theme" aria-label="Switch light/dark theme" title="Theme">${icon(isDark() ? 'sun' : 'moon')}</button>`;
  if (owner) {
    h += `<button class="btn btn-primary hide-mobile" data-act="new">${icon('plus')}<span>New post</span></button>`;
    h += `<button class="icon-btn" data-act="settings" aria-label="Settings" title="Settings">${icon('gear')}</button>`;
  } else if (store.mode === 'drive') {
    h += store.signedIn
      ? `<button class="btn" data-act="signout">${icon('logout')}<span>Sign out</span></button>`
      : `<button class="btn btn-google" data-act="signin">${GOOGLE_G}<span class="hide-mobile">Sign in with Google</span><span class="show-mobile">Sign in</span></button>`;
  }
  $('#header-actions').innerHTML = h;

  let fab = $('#fab');
  if (owner && !fab) {
    fab = document.createElement('button');
    fab.id = 'fab'; fab.className = 'fab'; fab.dataset.act = 'new';
    fab.setAttribute('aria-label', 'New post');
    fab.innerHTML = icon('plus');
    document.body.appendChild(fab);
  } else if (!owner && fab) fab.remove();

  renderBanner();
  const name = cfg.authorName || store.user?.name || store.publicMeta?.author?.name || '';
  $('#footer').innerHTML = `<span>© ${new Date().getFullYear()} ${esc(name || cfg.blogTitle)}</span><span class="dot">·</span><span>${demo ? 'Demo mode' : 'Stored in Google Drive'}</span>`;
}

function renderBanner() {
  let msg = '';
  if (demo) {
    msg = `<b>Demo mode</b> — posts are saved only in this browser. Follow SETUP.md to connect Google Drive.`;
  } else if (store.signedIn && !store.ownerOk) {
    msg = `Signed in as ${esc(store.user.email)}, but this blog belongs to someone else. <button data-act="signout">Sign out</button>`;
  } else if (store.isOwner && !store.info().configured) {
    msg = `<b>One last step:</b> copy your Public feed file ID into <code>js/config.js</code> so visitors can see your public posts. <button data-act="settings">Open settings</button>`;
  }
  $('#banner').innerHTML = msg ? `<div class="banner"><div class="wrap">${msg}</div></div>` : '';
}

// ── Routing ───────────────────────────────────────────────────
function render() {
  const m = location.hash.match(/^#\/post\/(.+)$/);
  if (m) {
    let id = m[1];
    try { id = decodeURIComponent(id); } catch {}
    return renderPost(id);
  }
  document.title = cfg.blogTitle;
  renderFeed();
}

function renderFeed() {
  const owner = store.isOwner;
  const types = ['all', ...Object.keys(TYPES)];
  main.innerHTML = `
    ${owner ? composePrompt() : ''}
    <div id="np-slot">${nowPlayingStrip()}</div>
    <div class="toolbar">
      <div class="chips" role="tablist" aria-label="Filter by type">
        ${types.map(t => `<button class="chip ${state.type === t ? 'active' : ''}" role="tab" aria-selected="${state.type === t}" data-act="filter" data-type="${t}">${t === 'all' ? 'All' : icon(t) + TYPES[t].plural}</button>`).join('')}
      </div>
      <div class="toolbar-row">
        <label class="search">${icon('search')}<input id="search" type="search" placeholder="Search posts" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search"></label>
        ${owner ? `<select id="vis-filter" class="select" aria-label="Filter by visibility">
          <option value="all">All</option>
          <option value="public" ${state.vis === 'public' ? 'selected' : ''}>Public</option>
          <option value="private" ${state.vis === 'private' ? 'selected' : ''}>Private</option>
        </select>` : ''}
      </div>
      ${state.tag ? `<div class="active-tag">Showing <b>#${esc(state.tag)}</b><button class="icon-btn sm" data-act="clear-tag" aria-label="Clear tag">${icon('x')}</button></div>` : ''}
    </div>
    <div id="feed" class="feed"></div>`;
  $('#search').addEventListener('input', e => { state.q = e.target.value; renderList(); });
  $('#vis-filter')?.addEventListener('change', e => { state.vis = e.target.value; renderList(); });
  renderList();
}

function renderNowPlaying() {
  const slot = $('#np-slot');
  if (slot) slot.innerHTML = nowPlayingStrip();
}

// Owner sees a small lock on the strip while it's hidden from visitors.
function nowPlayingStrip() {
  return nowPlayingHtml({ privateNote: store.isOwner && !store.settings?.lastfm?.public });
}

function composePrompt() {
  const u = store.user || {};
  return `<div class="card compose-prompt">
    <button class="compose-input" data-act="new" data-type="thought">${avatar(u)}<span>What's on your mind?</span></button>
    <div class="compose-types">
      ${Object.keys(TYPES).map(t => `<button class="ct ct-${t}" data-act="new" data-type="${t}">${icon(t)}<span>${TYPES[t].label}</span></button>`).join('')}
    </div>
  </div>`;
}

function avatar(u, cls = '') {
  const letter = esc((u?.name || '?').trim().charAt(0).toUpperCase());
  return u?.photo
    ? `<img class="avatar ${cls}" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar ${cls}">${letter}</span>`;
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return state.posts.filter(p =>
    (state.type === 'all' || p.type === state.type) &&
    (!state.tag || (p.tags || []).includes(state.tag)) &&
    (state.vis === 'all' || p.visibility === state.vis) &&
    (!q || [p.title, p.body, (p.tags || []).join(' '), p.link?.url, p.link?.title].join(' ').toLowerCase().includes(q)));
}

const skeleton = () => `<div class="card skeleton"><i></i><i></i><i></i></div><div class="card skeleton"><i></i><i></i></div>`;
const empty = (title, text, extra = '') =>
  `<div class="empty"><div class="empty-art">${icon('thought')}</div><h3>${title}</h3><p>${text}</p>${extra}</div>`;

function renderList() {
  const feed = $('#feed');
  if (!feed) return;
  if (state.loading) { feed.innerHTML = skeleton(); return; }
  if (state.error) {
    feed.innerHTML = empty('Something went wrong', esc(state.error), `<button class="btn" data-act="retry">Try again</button>`);
    return;
  }
  const list = filtered();
  if (!state.posts.length) {
    feed.innerHTML = store.isOwner
      ? empty('Your blog is empty', 'Write your first post — a thought, a photo, a video, a link or a quick note.', `<button class="btn btn-primary" data-act="new">${icon('plus')}New post</button>`)
      : empty('No public posts yet', 'Check back soon.');
  } else if (!list.length) {
    feed.innerHTML = empty('Nothing matches', 'Try a different filter or search.');
  } else {
    feed.innerHTML = list.map(p => postCard(p)).join('');
  }
  hydrate(feed);
}

function renderPost(id) {
  const p = state.posts.find(x => x.id === id);
  main.innerHTML = `<a class="back-link" href="#/">${icon('back')}All posts</a>
    ${state.loading ? skeleton() : p ? postCard(p, true) : empty('Post not found', 'It may be private or deleted.', `<a class="btn" href="#/">Go to all posts</a>`)}`;
  if (p) document.title = `${p.title || p.link?.title || TYPES[p.type]?.label || 'Post'} · ${cfg.blogTitle}`;
  hydrate(main);
}

// ── Post card ─────────────────────────────────────────────────
function postCard(p, full = false) {
  const owner = store.isOwner;
  const t = TYPES[p.type] ? p.type : 'thought';
  const linkUrl = safeUrl(p.link?.url);
  const embed = videoEmbed(p.videoUrl) || videoEmbed(linkUrl);
  const media = p.media || [];
  const images = media.filter(m => m.kind === 'image');
  const videos = media.filter(m => m.kind === 'video');
  const long = !full && (p.body || '').length > 600;
  const id = esc(p.id);
  const perm = `#/post/${encodeURIComponent(p.id)}`;
  const isPublic = p.visibility === 'public';

  return `<article class="card post post-${t}" data-id="${id}">
    <div class="post-meta">
      <span class="type-pill type-${t}">${icon(t)}${TYPES[t].label}</span>
      <a class="post-date" href="${perm}" title="${esc(fmtDate(p.createdAt, true))}">${esc(fmtDate(p.createdAt, full))}</a>
      ${owner ? `<button class="vis-badge ${isPublic ? 'public' : 'private'}" data-act="toggle-vis" data-id="${id}" title="Tap to make ${isPublic ? 'private' : 'public'}">${icon(isPublic ? 'globe' : 'lock')}<span>${isPublic ? 'Public' : 'Private'}</span></button>` : ''}
      <span class="spacer"></span>
      ${isPublic ? `<button class="icon-btn sm" data-act="share" data-id="${id}" aria-label="Share" title="Share">${icon('share')}</button>` : ''}
      ${owner ? `<button class="icon-btn sm" data-act="edit" data-id="${id}" aria-label="Edit" title="Edit">${icon('edit')}</button>
        <button class="icon-btn sm danger" data-act="delete" data-id="${id}" aria-label="Delete" title="Delete">${icon('trash')}</button>` : ''}
    </div>
    ${p.title ? `<h2 class="post-title">${full ? esc(p.title) : `<a href="${perm}">${esc(p.title)}</a>`}</h2>` : ''}
    ${embed ? `<div class="embed"><iframe src="${esc(embed)}" loading="lazy" title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : ''}
    ${images.length ? gallery(p, images, full) : ''}
    ${videos.map(v => `<div class="video-box" data-video="${esc(v.id)}"></div>`).join('')}
    ${linkUrl ? linkCard(p.link, linkUrl) : ''}
    ${p.body ? `<div class="prose post-body ${long ? 'clamped' : ''}">${md(p.body)}</div>${long ? `<a class="read-more" href="${perm}">Read more</a>` : ''}` : ''}
    ${(p.tags || []).length ? `<div class="tags">${p.tags.map(tag => `<button class="tag" data-act="tag" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join('')}</div>` : ''}
  </article>`;
}

function gallery(p, images, full) {
  const shown = full ? images : images.slice(0, 4);
  const extra = images.length - shown.length;
  const cls = full && images.length > 4 ? 'g-many' : `g-${Math.min(images.length, 4)}`;
  return `<div class="gallery ${cls}">${shown.map((m, i) => `
    <button class="g-item" data-act="lightbox" data-post="${esc(p.id)}" data-index="${i}" aria-label="Open photo ${i + 1}">
      <img data-media="${esc(m.id)}" alt="${esc(m.name || 'Photo')}">
      ${extra && i === shown.length - 1 ? `<span class="g-more">+${extra}</span>` : ''}
    </button>`).join('')}</div>`;
}

function linkCard(link, url) {
  const host = hostOf(url);
  return `<a class="link-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
    <img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" alt="" loading="lazy">
    <span class="link-text"><span class="link-title">${esc(link?.title || host)}</span><span class="link-host">${esc(host)}</span></span>
    ${icon('external')}
  </a>`;
}

// ── Media loading ─────────────────────────────────────────────
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); loadImg(e.target); } }), { rootMargin: '600px 0px' })
  : null;

function hydrate(root) {
  $$('img[data-media]', root).forEach(img => io ? io.observe(img) : loadImg(img));
  $$('.video-box', root).forEach(setupVideo);
}

async function loadImg(img) {
  const m = state.media.get(img.dataset.media);
  if (!m) return;
  const broken = () => img.closest('.g-item, .att')?.classList.add('broken');
  img.onload = () => img.classList.add('loaded');
  img.onerror = () => {
    const fb = store.fallbackImageUrl(m);
    if (fb && !img.dataset.fb) { img.dataset.fb = '1'; img.src = fb; } else broken();
  };
  try { img.src = await store.imageUrl(m); }
  catch (e) { broken(); if (e instanceof AuthError) authExpired(); }
}

function setupVideo(box) {
  const m = state.media.get(box.dataset.video);
  if (!m) return;
  const src = store.videoSrc(m);
  const preview = !src && store.videoPreviewUrl(m);
  if (preview) {
    box.innerHTML = `<div class="embed"><iframe src="${esc(preview)}" allow="autoplay" allowfullscreen title="Video" loading="lazy"></iframe></div>`;
  } else if (src) {
    box.innerHTML = `<video controls playsinline preload="metadata" src="${esc(src)}"></video>`;
    $('video', box).addEventListener('error', () => {
      box.innerHTML = `<div class="embed"><iframe src="https://drive.google.com/file/d/${encodeURIComponent(m.id)}/preview" allow="autoplay" allowfullscreen title="Video"></iframe></div>`;
    }, { once: true });
  } else {
    box.innerHTML = `<button class="video-load" data-act="load-video" data-id="${esc(m.id)}">
      <span class="play">${icon('play')}</span><span class="vl-text">Play video</span><small>${esc(m.name || '')} ${fmtSize(m.size)}</small></button>`;
  }
}

async function loadVideo(btn) {
  const m = state.media.get(btn.dataset.id);
  const box = btn.closest('.video-box');
  btn.disabled = true;
  $('.vl-text', btn).textContent = 'Loading…';
  try {
    const url = await store.videoBlobUrl(m);
    box.innerHTML = `<video controls playsinline autoplay src="${esc(url)}"></video>`;
  } catch (e) {
    handleError(e);
    btn.disabled = false;
    $('.vl-text', btn).textContent = 'Play video';
  }
}

// ── Lightbox (swipe on phones, arrows on desktop) ─────────────
function openLightbox(postId, index) {
  const p = state.posts.find(x => x.id === postId);
  const imgs = (p?.media || []).filter(m => m.kind === 'image');
  if (!imgs.length) return;
  let i = index;
  const root = document.createElement('div');
  root.className = 'lightbox';
  root.innerHTML = `<button class="lb-btn lb-close" aria-label="Close">${icon('x')}</button>
    ${imgs.length > 1 ? `<button class="lb-btn lb-prev" aria-label="Previous">${icon('left')}</button><button class="lb-btn lb-next" aria-label="Next">${icon('right')}</button>` : ''}
    <img class="lb-img" alt=""><div class="lb-count"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const img = $('.lb-img', root);
  img.onload = () => img.classList.add('loaded');
  let seq = 0;
  const show = async () => {
    const mine = ++seq;
    $('.lb-count', root).textContent = imgs.length > 1 ? `${i + 1} / ${imgs.length}` : '';
    img.classList.remove('loaded');
    let url;
    try { url = await store.imageUrl(imgs[i]); } catch { url = store.fallbackImageUrl(imgs[i]); }
    if (mine === seq) img.src = url; // ignore slow loads from earlier swipes
  };
  const go = d => { i = (i + d + imgs.length) % imgs.length; show(); };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  const close = () => { root.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey, true); };
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', e => {
    if (e.target.closest('.lb-prev')) go(-1);
    else if (e.target.closest('.lb-next')) go(1);
    else if (e.target.closest('.lb-close') || e.target === root) close();
  });
  // One-finger swipe changes photo; two fingers are left alone for pinch-zoom.
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  root.addEventListener('touchmove', e => { if (e.touches.length > 1) x0 = null; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 == null || (window.visualViewport?.scale || 1) > 1.05) { x0 = null; return; }
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50 && imgs.length > 1) go(dx < 0 ? 1 : -1);
    x0 = null;
  });
  show();
}

// ── Modals ────────────────────────────────────────────────────
let modalSticky = false;
function openModal(html, { cls = '', sticky = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.classList.add('no-scroll');
  modalSticky = sticky;
  const backdrop = root.firstElementChild;
  backdrop.addEventListener('click', e => { if (e.target === backdrop && !modalSticky) closeModal(); });
  return $('.modal', root);
}

function closeModal(force = false) {
  if (!force && comp) {
    if (comp.busy && !confirm('Your post is still saving. Close anyway?')) return;
    if (!comp.busy && comp.dirty && !confirm('Discard this post?')) return;
    if (!comp.busy && comp.newIds.length) cleanupOrphans(comp.newIds);
  }
  if (comp) {
    for (const f of comp.files) URL.revokeObjectURL(f.preview);
    for (const u of Object.values(comp.previews)) URL.revokeObjectURL(u);
  }
  comp = null;
  $('#modal-root').innerHTML = '';
  document.body.classList.remove('no-scroll');
}

// ── Composer ──────────────────────────────────────────────────
let comp = null;

function openComposer(type = 'thought', post = null) {
  const t = post?.type || type;
  comp = {
    type: t, post, kept: [...(post?.media || [])], files: [],
    vis: post?.visibility || (t === 'note' ? 'private' : 'public'),
    visTouched: !!post, busy: false, dirty: false,
    newIds: [],    // files uploaded in this editor session (kept if saving fails, so retry doesn't re-upload)
    previews: {},  // local previews for those uploaded files
  };
  const title = post ? (post.title || post.link?.title || '') : '';
  const m = openModal(`
    <form class="composer" id="composer" novalidate>
      <div class="modal-head">
        <button type="button" class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button>
        <h3>${post ? 'Edit post' : 'New post'}</h3>
        <button type="submit" class="btn btn-primary" id="c-submit">${post ? 'Save' : 'Publish'}</button>
      </div>
      <div class="type-tabs" role="tablist">
        ${Object.keys(TYPES).map(k => `<button type="button" class="type-tab tt-${k}" data-ctype="${k}" role="tab">${icon(k)}<span>${TYPES[k].label}</span></button>`).join('')}
      </div>
      <div class="modal-body">
        <input class="field f-title" name="title" placeholder="Title" maxlength="200" value="${esc(title)}" data-for="thought photo video link" autocomplete="off">
        <input class="field" name="url" type="url" inputmode="url" placeholder="Paste a link (https://…)" value="${esc(post?.link?.url || '')}" data-for="link" autocomplete="off">
        <input class="field" name="videoUrl" type="url" inputmode="url" placeholder="Or paste a YouTube / Vimeo link" value="${esc(post?.videoUrl || '')}" data-for="video" autocomplete="off">
        <div class="dropzone">
          <input type="file" id="c-files" multiple hidden>
          <button type="button" class="drop-btn" data-c="pick">${icon('upload')}<span class="drop-label">Add photos or videos</span><small class="hide-mobile">or drag them here</small></button>
          <div class="attachments" id="c-attach"></div>
        </div>
        <textarea class="field f-body" name="body" rows="5">${esc(post?.body || '')}</textarea>
        <div class="md-hint" data-for="thought">Markdown works: **bold**, _italic_, [link](https://…), - lists, &gt; quotes</div>
        <input class="field" name="tags" placeholder="Tags, separated by commas" value="${esc((post?.tags || []).join(', '))}" autocomplete="off" autocapitalize="none">
      </div>
      <div class="modal-foot">
        <div class="seg" role="radiogroup" aria-label="Who can see this">
          <button type="button" class="seg-btn" data-vis="public" role="radio">${icon('globe')}Public</button>
          <button type="button" class="seg-btn" data-vis="private" role="radio">${icon('lock')}Private</button>
        </div>
        <span class="vis-help" id="c-vis-help"></span>
      </div>
      <div class="c-status" id="c-status" hidden></div>
    </form>`, { cls: 'modal-composer', sticky: true });

  const form = $('#composer', m);
  const fileInput = $('#c-files', m);

  form.addEventListener('click', e => {
    const tab = e.target.closest('[data-ctype]');
    const vis = e.target.closest('[data-vis]');
    const rm = e.target.closest('[data-remove]');
    if (tab && !comp.busy) { comp.type = tab.dataset.ctype; if (!comp.visTouched) comp.vis = comp.type === 'note' ? 'private' : 'public'; applyType(form); }
    else if (vis && !comp.busy) { comp.vis = vis.dataset.vis; comp.visTouched = true; applyType(form); }
    else if (rm && !comp.busy) { removeAttachment(rm.dataset.remove); }
    else if (e.target.closest('[data-c="pick"]') && !comp.busy) fileInput.click();
  });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  form.addEventListener('input', () => { comp.dirty = true; });
  const dz = $('.dropzone', form);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); });
  $('.f-body', form).addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); submitComposer(form); });

  applyType(form);
  renderAttachments();
  setTimeout(() => {
    const first = comp?.type === 'link' ? form.elements.url : comp?.type === 'note' ? form.elements.body : form.elements.title;
    if (matchMedia('(pointer: fine)').matches) first?.focus();
  }, 50);
}

function applyType(form) {
  const t = comp.type;
  $$('[data-ctype]', form).forEach(b => { b.classList.toggle('active', b.dataset.ctype === t); b.setAttribute('aria-selected', b.dataset.ctype === t); });
  $$('[data-for]', form).forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(t); });
  $$('[data-vis]', form).forEach(b => { b.classList.toggle('active', b.dataset.vis === comp.vis); b.setAttribute('aria-checked', b.dataset.vis === comp.vis); });
  $('#c-vis-help').textContent = comp.vis === 'public' ? 'Anyone can see this' : 'Only you can see this';
  form.elements.body.placeholder = TYPES[t].placeholder;
  form.elements.title.placeholder = t === 'link' ? 'Title (optional)' : t === 'thought' ? 'Title' : 'Title (optional)';
  const input = $('#c-files', form);
  input.accept = t === 'photo' ? 'image/*' : t === 'video' ? 'video/*' : 'image/*,video/*';
  input.multiple = t !== 'video';
  $('.drop-label', form).textContent = t === 'photo' ? 'Add photos' : t === 'video' ? 'Upload a video' : 'Add photos or videos';
  form.classList.toggle('is-note', t === 'note');
}

function addFiles(list) {
  for (const file of list) {
    const kind = file.type.startsWith('video/') ? 'video'
      : (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) ? 'image' : null;
    if (!kind) { toast(`${file.name} isn't a photo or video.`, { kind: 'error' }); continue; }
    if (file.size > 750 * 1024 * 1024) { toast(`${file.name} is over 750 MB. For long videos, upload to YouTube and paste the link.`, { kind: 'error', timeout: 8000 }); continue; }
    comp.files.push({ key: uid(), file, kind, preview: URL.createObjectURL(file) });
  }
  comp.dirty = true;
  renderAttachments();
}

function removeAttachment(key) {
  const [src, id] = [key.slice(0, 1), key.slice(2)];
  if (src === 'k') comp.kept = comp.kept.filter(m => m.id !== id);
  else {
    const f = comp.files.find(x => x.key === id);
    if (f) URL.revokeObjectURL(f.preview);
    comp.files = comp.files.filter(x => x.key !== id);
  }
  comp.dirty = true;
  renderAttachments();
}

function renderAttachments() {
  const el = $('#c-attach');
  if (!el || !comp) return;
  const items = [
    ...comp.kept.map(m => ({ key: 'k:' + m.id, kind: m.kind, name: m.name, id: m.id, preview: comp.previews[m.id] })),
    ...comp.files.map(f => ({ key: 'n:' + f.key, kind: f.kind, name: f.file.name, preview: f.preview })),
  ];
  el.innerHTML = items.map(a => `
    <div class="att" data-key="${esc(a.key)}">
      ${a.kind === 'image'
        ? (a.preview ? `<img src="${esc(a.preview)}" alt="" class="loaded">` : `<img data-media="${esc(a.id)}" alt="">`)
        : (a.preview ? `<video src="${esc(a.preview)}" muted playsinline preload="metadata"></video><span class="att-badge">${icon('video')}</span>` : `<div class="att-video">${icon('video')}<span>${esc(a.name || 'Video')}</span></div>`)}
      <button type="button" class="att-remove" data-remove="${esc(a.key)}" aria-label="Remove">${icon('x')}</button>
      <div class="att-progress" hidden><i></i></div>
    </div>`).join('');
  $$('img[data-media]', el).forEach(loadImg);
  el.hidden = !items.length;
}

function setProgress(key, frac) {
  const bar = $(`.att[data-key="n:${key}"] .att-progress`);
  if (!bar) return;
  bar.hidden = false;
  $('i', bar).style.width = `${Math.round(frac * 100)}%`;
}

function readForm(form) {
  const t = comp.type;
  const title = form.elements.title.value.trim();
  const v = { type: t, title: t === 'note' || t === 'link' ? '' : title, body: form.elements.body.value.trim(), tags: parseTags(form.elements.tags.value) };
  if (t === 'link') v.link = { url: safeUrl(form.elements.url.value.trim()), title };
  if (t === 'video' && form.elements.videoUrl.value.trim()) v.videoUrl = safeUrl(form.elements.videoUrl.value.trim());
  return v;
}

function validate(v) {
  const imgs = comp.kept.filter(m => m.kind === 'image').length + comp.files.filter(f => f.kind === 'image').length;
  const vids = comp.kept.filter(m => m.kind === 'video').length + comp.files.filter(f => f.kind === 'video').length;
  const anyMedia = imgs + vids > 0;
  switch (v.type) {
    case 'link': return v.link.url ? '' : 'Paste a valid link (starting with https://).';
    case 'photo': return imgs ? '' : 'Add at least one photo.';
    case 'video':
      if (v.videoUrl && !videoEmbed(v.videoUrl)) return 'Only YouTube and Vimeo links can be shown as videos. Use a Link post for other sites.';
      return vids || v.videoUrl ? '' : 'Upload a video or paste a YouTube / Vimeo link.';
    case 'note': return v.body || anyMedia ? '' : 'Write something first.';
    default: return v.title || v.body || anyMedia ? '' : 'Add a title or write something first.';
  }
}

function setBusy(form, busy, label) {
  comp.busy = busy;
  form.classList.toggle('busy', busy);
  $$('input, textarea, button', form).forEach(el => { if (el.dataset.act !== 'close-modal') el.disabled = busy; });
  $('#c-submit').textContent = busy ? (label || 'Saving…') : (comp.post ? 'Save' : 'Publish');
}

function submitComposer(form) {
  if (comp.busy) return;
  const v = readForm(form);
  const err = validate(v);
  if (err) { toast(err, { kind: 'error' }); return; }
  // Ask Google for a fresh sign-in right away (must happen during the tap).
  const auth = store.tokenValid() ? Promise.resolve() : store.requestToken();
  setBusy(form, true, 'Saving…');
  const c = comp;
  saveComposer(v, auth).catch(e => { handleError(e); if (comp === c) setBusy(form, false); });
}

async function saveComposer(v, auth) {
  await auth;
  const c = comp;
  const status = $('#c-status');
  const editing = c.post;
  try {
    const total = c.files.length;
    let n = 0;
    // Each finished upload moves from "new files" to "kept", so a retry won't upload it twice.
    while (c.files.length) {
      const f = c.files[0];
      status.hidden = false;
      status.textContent = `Uploading ${++n} of ${total}…`;
      setProgress(f.key, 0);
      const file = f.kind === 'image' ? await shrinkImage(f.file) : f.file;
      const r = await store.uploadMedia(file, pr => setProgress(f.key, pr));
      const media = { id: r.id, name: r.name || file.name, mimeType: r.mimeType || file.type, size: Number(r.size || file.size), kind: f.kind, shared: false };
      c.files.shift();
      c.kept.push(media);
      c.newIds.push(media.id);
      c.previews[media.id] = f.preview;
      if (comp === c) renderAttachments();
    }
    status.hidden = false;
    status.textContent = 'Saving…';
    const now = new Date().toISOString();
    const post = {
      id: editing?.id || uid(), type: v.type, title: v.title, body: v.body, tags: v.tags,
      visibility: c.vis, media: [...c.kept],
      createdAt: editing?.createdAt || now, updatedAt: now,
    };
    if (v.link) post.link = v.link;
    if (v.videoUrl) post.videoUrl = v.videoUrl;

    let removed = [];
    const posts = await store.mutate(list => {
      const i = list.findIndex(x => x.id === post.id);
      if (i >= 0) {
        const old = list[i];
        const keep = new Set(post.media.map(m => m.id));
        removed = (old.media || []).filter(m => !keep.has(m.id)).map(m => m.id);
        post.media = post.media.map(m => ({ ...m, shared: (old.media || []).find(o => o.id === m.id)?.shared ?? m.shared }));
        list[i] = post;
      } else list.unshift(post);
      return list;
    });
    setPosts(posts);
    if (removed.length) store.trashMedia(removed).catch(() => {});
    if (comp === c) closeModal(true);
    toast(editing ? 'Post updated' : (post.visibility === 'public' ? 'Published!' : 'Saved privately'), { kind: 'success' });
    render();
  } catch (e) {
    // Uploaded files stay attached; pressing Publish again retries without re-uploading.
    status.hidden = true;
    throw e;
  }
}

// Files uploaded in an editor that was then closed without saving: trash any no saved post uses.
async function cleanupOrphans(ids) {
  try {
    const posts = await store.loadPosts();
    const used = new Set(posts.flatMap(p => (p.media || []).map(m => m.id)));
    const orphans = ids.filter(id => !used.has(id));
    if (orphans.length) await store.trashMedia(orphans);
  } catch (e) { console.warn('Cleanup skipped', e); }
}

// ── Post actions ──────────────────────────────────────────────
function withAuth(fn) {
  const auth = store.tokenValid() ? Promise.resolve() : store.requestToken();
  return auth.then(fn).catch(handleError);
}

function toggleVis(id, btn) {
  btn.disabled = true;
  btn.classList.add('saving');
  withAuth(async () => {
    let now = '';
    const posts = await store.mutate(list => {
      const p = list.find(x => x.id === id);
      if (p) { p.visibility = p.visibility === 'public' ? 'private' : 'public'; now = p.visibility; }
      return list;
    });
    setPosts(posts);
    render();
    toast(now === 'public' ? 'Now public — anyone can see it' : 'Now private — only you can see it', { kind: 'success' });
  }).finally(() => { btn.disabled = false; btn.classList.remove('saving'); });
}

function deletePost(id) {
  // Get a fresh Google sign-in first (needs the tap), then ask to confirm.
  withAuth(async () => {
    if (!confirm('Delete this post? Its photos and videos will be moved to the trash.')) return;
    let removed = [];
    const posts = await store.mutate(list => {
      const p = list.find(x => x.id === id);
      removed = (p?.media || []).map(m => m.id);
      return list.filter(x => x.id !== id);
    });
    setPosts(posts);
    store.trashMedia(removed).catch(() => {});
    toast('Post deleted');
    if (location.hash.startsWith('#/post/')) location.hash = '#/'; else render();
  });
}

async function sharePost(id) {
  const p = state.posts.find(x => x.id === id);
  const url = `${location.href.split('#')[0]}#/post/${encodeURIComponent(id)}`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: p?.title || cfg.blogTitle, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyText(url, 'Link copied');
}

async function copyText(text, msg = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(msg, { kind: 'success' }); }
  catch { prompt('Copy this:', text); }
}

function backup() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), posts: state.posts }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Settings ──────────────────────────────────────────────────
function openSettings() {
  const info = store.info();
  const u = store.user || {};
  openModal(`
    <div class="modal-head">
      <button type="button" class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button>
      <h3>Settings</h3><span class="head-spacer"></span>
    </div>
    <div class="modal-body settings">
      <section>
        <h4>Account</h4>
        <div class="account">${avatar(u, 'lg')}<div><b>${esc(u.name || '')}</b><span>${esc(u.email || (demo ? 'Not connected to Google' : ''))}</span></div></div>
        ${info.mode === 'drive' ? `<button class="btn" data-act="signout">${icon('logout')}Sign out</button>` : ''}
      </section>
      <section id="lastfm-section">${lastfmSectionHtml()}</section>
      ${info.mode === 'drive' ? `
      <section>
        <h4>Public feed file ID</h4>
        <p class="muted">Visitors read your public posts from this file. Paste it into <code>js/config.js</code> as <code>publicIndexFileId</code>.</p>
        <div class="copy-row"><code>${esc(info.publicIndexFileId)}</code><button class="btn" data-act="copy" data-text="${esc(info.publicIndexFileId)}">${icon('copy')}Copy</button></div>
        <p class="status ${info.configured ? 'ok' : 'warn'}">${info.configured
          ? `${icon('check')}config.js is set up — visitors can see your public posts.`
          : 'Not set up yet — visitors will see “No public posts yet” until this ID is in config.js.'}</p>
        ${info.hasApiKey ? '' : `<p class="status warn">googleApiKey is empty in config.js — visitors can't read posts without it.</p>`}
      </section>
      <section>
        <h4>Storage</h4>
        <p class="muted">Everything lives in a “My Blog” folder in your Google Drive.</p>
        <a class="btn" href="${esc(info.folderUrl)}" target="_blank" rel="noopener">${icon('folder')}Open in Google Drive</a>
      </section>` : `
      <section>
        <h4>Demo mode</h4>
        <p class="muted">Posts are saved only in this browser. Follow SETUP.md to connect Google Drive.</p>
        <button class="btn btn-danger" data-act="clear-demo">${icon('trash')}Erase demo posts</button>
      </section>`}
      <section>
        <h4>Backup</h4>
        <p class="muted">Download all your posts as a file. Photos and videos stay in ${demo ? 'this browser' : 'Drive'}.</p>
        <button class="btn" data-act="backup">${icon('download')}Download backup</button>
      </section>
    </div>`, { cls: 'modal-settings' });
  wireLastfmForm();
}

// ── Last.fm (Settings) ────────────────────────────────────────
function lastfmSectionHtml() {
  if (!lastfmAvailable(cfg)) {
    return `<h4>Last.fm</h4><p class="muted">To show what you're listening to, add a Last.fm API key to <code>js/config.js</code> as <code>lastfmApiKey</code>. See SETUP.md.</p>`;
  }
  const lf = store.settings?.lastfm;
  if (!lf?.user) {
    return `<h4>Last.fm</h4>
      <p class="muted">Show what you're listening to above your posts. Only you see it unless you choose otherwise.</p>
      <form class="lfm-form" id="lfm-form" novalidate>
        <input class="field" name="lfmUser" placeholder="Your Last.fm username" autocomplete="off" autocapitalize="none" spellcheck="false">
        <button class="btn btn-primary" type="submit">Connect</button>
      </form>`;
  }
  const url = safeUrl(lf.url) || `https://www.last.fm/user/${encodeURIComponent(lf.user)}`;
  return `<h4>Last.fm</h4>
    <div class="account">
      ${lf.image ? `<img class="avatar lg" src="${esc(lf.image)}" alt="">` : `<span class="avatar lg lfm-avatar">${icon('music')}</span>`}
      <div><b>${esc(lf.name || lf.user)}</b><a href="${esc(url)}" target="_blank" rel="noopener">last.fm/user/${esc(lf.user)}</a></div>
    </div>
    <label class="switch-row">
      <input type="checkbox" data-act="lfm-public" ${lf.public ? 'checked' : ''}>
      <span class="switch" aria-hidden="true"></span>
      <span class="switch-text"><b>Show on my public blog</b>
        <small>${lf.public ? 'Visitors can see what you’re listening to.' : 'Off — only you can see it.'}</small></span>
    </label>
    <button class="btn" data-act="lfm-disconnect">Disconnect Last.fm</button>`;
}

function redrawLastfmSection() {
  const sec = $('#lastfm-section');
  if (!sec) return;
  sec.innerHTML = lastfmSectionHtml();
  wireLastfmForm();
}

function wireLastfmForm() {
  const form = $('#lfm-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.elements.lfmUser.value.trim();
    if (!name) { toast('Type your Last.fm username first.', { kind: 'error' }); return; }
    const auth = store.tokenValid() ? Promise.resolve() : store.requestToken(); // needs the tap
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Checking…';
    auth.then(() => lookupUser(name))
      .then(info => store.mutate((posts, settings) => {
        settings.lastfm = { user: info.user, name: info.name, image: info.image, url: info.url, public: false };
        return posts;
      }).then(() => info))
      .then(info => { toast(`Connected to Last.fm as ${info.user}`, { kind: 'success' }); redrawLastfmSection(); refreshLastfm(); })
      .catch(err => { handleError(err); btn.disabled = false; btn.textContent = 'Connect'; });
  });
}

function setLastfmPublic(el) {
  const on = el.checked;
  el.disabled = true;
  withAuth(async () => {
    await store.mutate((posts, settings) => { if (settings.lastfm) settings.lastfm.public = on; return posts; });
    toast(on ? 'Visitors can now see what you’re listening to' : 'Last.fm is now hidden from visitors', { kind: 'success' });
    refreshLastfm();
  }).finally(redrawLastfmSection);
}

function disconnectLastfm() {
  withAuth(async () => {
    await store.mutate((posts, settings) => { delete settings.lastfm; return posts; });
    toast('Last.fm disconnected');
    redrawLastfmSection();
    refreshLastfm();
  });
}

// ── Errors & sign-in ──────────────────────────────────────────
function handleError(e) {
  console.error(e);
  if (e instanceof AuthError) return authExpired();
  toast(e?.message || 'Something went wrong.', { kind: 'error', timeout: 7000 });
}

let authToast = null;
function authExpired() {
  if (authToast?.isConnected) return;
  authToast = toast('Your Google session expired.', {
    kind: 'error', action: 'Sign in', timeout: 0,
    onAction: () => store.requestToken()
      .then(() => store.afterSignIn())
      .then(() => { renderChrome(); return refresh(); })
      .catch(handleError),
  });
}

function signIn() {
  store.signIn()
    .then(() => { renderChrome(); return refresh(); })
    .catch(handleError);
}

// ── Click handling ────────────────────────────────────────────
function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'theme': {
      const t = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('myblog.theme', t); } catch {}
      renderChrome();
      break;
    }
    case 'new': if (store.isOwner) openComposer(el.dataset.type || 'thought'); break;
    case 'edit': { const p = state.posts.find(x => x.id === id); if (p) openComposer(p.type, p); break; }
    case 'delete': deletePost(id); break;
    case 'toggle-vis': toggleVis(id, el); break;
    case 'share': sharePost(id); break;
    case 'settings': openSettings(); break;
    case 'signin': signIn(); break;
    case 'signout': store.signOut?.(); closeModal(true); renderChrome(); refresh(); break;
    case 'filter': state.type = el.dataset.type; renderFeed(); break;
    case 'tag':
      state.tag = el.dataset.tag;
      if (location.hash.startsWith('#/post/')) location.hash = '#/'; else { renderFeed(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      break;
    case 'clear-tag': state.tag = ''; renderFeed(); break;
    case 'lightbox': openLightbox(el.dataset.post, Number(el.dataset.index)); break;
    case 'load-video': loadVideo(el); break;
    case 'close-modal': closeModal(); break;
    case 'copy': copyText(el.dataset.text); break;
    case 'backup': backup(); break;
    case 'clear-demo':
      if (confirm('Erase all demo posts in this browser?')) store.clearAll().then(() => location.reload());
      break;
    case 'retry': refresh(); break;
    case 'lfm-public': setLastfmPublic(el); break;
    case 'lfm-disconnect': disconnectLastfm(); break;
  }
}

boot();
