// Optional Last.fm "now playing" strip.
// The Last.fm API key lives in js/config.js (lastfmApiKey). Each blog owner connects their own
// Last.fm username in Settings; it's saved in their Drive, never in the code.
import { esc, fmtDate, icon } from './util.js';

const API = 'https://ws.audioscrobbler.com/2.0/';
const NO_ART = '2a96cbd8b46e442fc41c2b86b821562f'; // Last.fm's grey star placeholder

let cfg = {};
let getUser = () => '';
let onChange = () => {};
let latest = null;
let timer = null;

export function lastfmAvailable(c = cfg) {
  return !!c.lastfmApiKey;
}

function call(method, params) {
  const q = new URLSearchParams({ method, format: 'json', api_key: cfg.lastfmApiKey, ...params });
  return fetch(`${API}?${q}`, { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => null);
    if (d?.error) { const e = new Error(d.message || 'Last.fm error'); e.code = d.error; throw e; }
    if (!r.ok || !d) throw new Error(`Last.fm error ${r.status}`);
    return d;
  });
}

function bestImage(list) {
  const img = [...(list || [])].reverse().find(i => i['#text'] && !i['#text'].includes(NO_ART));
  return img?.['#text'] || '';
}

// Check a username exists. Returns { user, name, image, url }.
export async function lookupUser(username) {
  try {
    const d = await call('user.getinfo', { user: username });
    const u = d.user || {};
    return { user: u.name || username, name: u.realname || u.name || username, image: bestImage(u.image), url: u.url || `https://www.last.fm/user/${encodeURIComponent(username)}` };
  } catch (e) {
    if (e.code === 6) throw new Error(`There's no Last.fm user called “${username}”.`);
    if (e.code === 10 || e.code === 26) throw new Error('The Last.fm API key in js/config.js is not valid.');
    throw new Error("Couldn't reach Last.fm. Try again in a moment.");
  }
}

async function fetchLatest(user) {
  const d = await call('user.getrecenttracks', { user, limit: '1' });
  const t = [].concat(d?.recenttracks?.track || [])[0];
  if (!t) return null;
  return {
    name: t.name || '',
    artist: t.artist?.['#text'] || t.artist?.name || '',
    album: t.album?.['#text'] || '',
    art: bestImage(t.image),
    url: /^https:\/\/(www\.)?last\.fm\//.test(t.url || '') ? t.url : `https://www.last.fm/user/${encodeURIComponent(user)}`,
    nowPlaying: t['@attr']?.nowplaying === 'true',
    playedAt: t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : '',
  };
}

// HTML for the strip, or '' when there's nothing to show.
export function nowPlayingHtml({ privateNote = false } = {}) {
  const t = latest;
  if (!t || !t.name) return '';
  const label = t.nowPlaying
    ? `<span class="np-bars" aria-hidden="true"><i></i><i></i><i></i></span>Listening now`
    : `Last played${t.playedAt ? ` · ${esc(fmtDate(t.playedAt))}` : ''}`;
  return `<a class="np ${t.nowPlaying ? 'live' : ''}" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"
      title="${esc(`${t.name} — ${t.artist}${t.album ? ` (${t.album})` : ''} on Last.fm`)}">
    ${t.art ? `<img class="np-art" src="${esc(t.art)}" alt="" loading="lazy">` : `<span class="np-art np-art-empty">${icon('music')}</span>`}
    <span class="np-text">
      <span class="np-label">${label}</span>
      <span class="np-line"><b>${esc(t.name)}</b><span class="np-artist"> · ${esc(t.artist)}</span></span>
    </span>
    ${privateNote ? `<span class="np-private" title="Only you can see this">${icon('lock')}</span>` : ''}
  </a>`;
}

async function tick() {
  const user = getUser();
  if (!user || !lastfmAvailable()) {
    if (latest) { latest = null; onChange(); }
    return;
  }
  if (document.hidden) return;
  try {
    latest = await fetchLatest(user);
  } catch (e) {
    console.warn('Last.fm:', e.message); // stay quiet in the page
    latest = null;
  }
  onChange(); // also keeps "Last played · 5m ago" fresh
}

// getUser() returns the username to show (or ''); onChange() re-draws the strip.
export function startLastfm(config, getUserFn, onChangeFn) {
  cfg = config; getUser = getUserFn; onChange = onChangeFn;
  if (!lastfmAvailable()) return;
  tick();
  timer = setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

// Call after the username changes (connect, disconnect, sign-in, sign-out).
export function refreshLastfm() {
  if (timer) tick();
}
