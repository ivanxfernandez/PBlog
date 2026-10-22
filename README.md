# My Blog

A personal blog that runs as a single static web page (HTML, CSS and vanilla JavaScript — no build step), hosted free on **GitHub Pages**.
Posts, photos and videos are stored in **your own Google Drive**, not on GitHub. You sign in with Google to write; visitors just read your public posts.

**New here? Follow [SETUP.md](SETUP.md)** for a step-by-step guide to getting it live.

## Features

- Five post types: **Thought** (titled, Markdown), **Photo** (one or more images + caption), **Video** (upload a file or paste a YouTube/Vimeo link), **Link** (URL + title + comment) and **Note** (quick short note).
- **Public / Private** toggle on every post. Visitors only ever see Public posts.
- Tags, edit and delete (deleting moves media to Drive trash).
- Shareable permalink for each post: `#/post/<id>`.
- Photos are resized to max 2400 px before upload to save space.
- Sign in with Google (Google Identity Services) using only the `drive.file` scope — the app can see **only the files it created**.
- **Demo mode** when no Google settings are filled in: try everything locally, data stays in that browser.
- Optional **Last.fm "now playing"** strip above the posts. Each owner connects their own Last.fm username in Settings (it's saved in their Drive). Only they see it, unless they turn on **Show on my public blog**.

## How data is stored

Everything lives in a **My Blog** folder in the owner's Google Drive:

| File | Who can see it |
|---|---|
| `posts.json` | Only you (all posts) |
| `public-posts.json` | Anyone with the link (Public posts only) — visitors read it through a Google API key |
| Photos / videos | Public posts' media: anyone with the link. Private posts' media: only you |

## File layout

```
index.html      The single page
css/            Styles
js/             App code (JavaScript modules)
js/lastfm.js    Optional Last.fm "now playing" strip
js/config.js    Your settings — the only file you need to edit
serve.js        Tiny local web server for testing (Node.js, no dependencies)
.nojekyll       Tells GitHub Pages to serve files as-is
README.md       This file
SETUP.md        Step-by-step setup guide
```

## Configuration

Edit `js/config.js`:

```js
window.BLOG_CONFIG = {
  blogTitle: "My Blog",
  tagline: "Thoughts, photos, videos, links and notes",
  googleClientId: "",      // OAuth 2.0 Client ID (Web application)
  googleApiKey: "",        // API key, used by visitors to read public posts
  publicIndexFileId: "",   // shown in the app's Settings panel after first sign-in
  ownerEmail: "",          // optional: only this Google account sees the editor
  lastfmApiKey: ""         // optional: Last.fm API key (never the shared secret); usernames are set in Settings
};
```

Leave the Google fields empty to run in Demo mode. See [SETUP.md](SETUP.md) for how to get each value.

## Run locally

From the project folder:

```
node serve.js
```

Then open **http://localhost:8080**.
(Alternative, if you have Python: `python -m http.server 8080`.)

The page must be served over `http://` — opening `index.html` directly as a file won't work, because the app uses JavaScript modules.
