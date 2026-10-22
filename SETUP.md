# Setup guide

This guide takes you from "a folder of files on my PC" to "my blog is live on the internet".
You don't need to be a programmer. Follow the steps in order. It takes about 30–45 minutes the first time.

Throughout this guide:

- `<username>` means **your GitHub username** (for example `ivanf`).
- `<repo>` means **the name of your GitHub repository** (for example `my-blog`).

Replace them with your own values whenever you see them.

---

## 1. How it works

The blog is a set of plain web files (HTML, CSS and JavaScript). GitHub Pages hosts those files for free.
Your posts, photos and videos are **not** stored on GitHub. They live in **your own Google Drive**, in a folder called **My Blog** that the app creates.
You sign in with Google to write. Visitors don't sign in at all. They can only read the posts you marked **Public**.

```
   You (signed in)                     Visitors (not signed in)
        │                                       │
        ▼                                       ▼
  ┌──────────────────────────────────────────────────────┐
  │  Your blog site  https://<username>.github.io/<repo>/ │   ← hosted free by GitHub Pages
  └──────────────────────────────────────────────────────┘
        │  read + write                         │  read only (public posts)
        ▼                                       ▼
  ┌──────────────────────────────────────────────────────┐
  │  Your Google Drive → "My Blog" folder                 │
  │    posts.json          (all posts, private)           │
  │    public-posts.json   (public posts, shared by link) │
  │    photos / videos                                    │
  └──────────────────────────────────────────────────────┘
```

**Privacy note:** the app asks Google only for the `drive.file` permission. That means it can see **only the files it created itself**. It cannot read anything else in your Drive.

---

## 2. Try it on your own PC first

Before putting anything online, you can try the blog on your computer in **Demo mode**.
Demo mode means no Google settings are filled in yet, so posts are saved only inside that one browser.

You need **Node.js** installed (it is already on your PC). Node.js is a program that runs JavaScript outside the browser. We use it here only to start a tiny local web server.

1. Open the project folder in File Explorer.
2. Click the address bar at the top, type `cmd` and press **Enter**. A black Command Prompt window opens, already inside the project folder.
3. Type this and press **Enter**:

   ```
   node serve.js
   ```

4. Open your browser and go to **http://localhost:8080**
5. You should see your blog with a "Demo mode" notice. Try writing a few posts.
6. When you're done, go back to the black window and press **Ctrl + C** to stop the server.

> **Alternative:** if you ever install Python, `python -m http.server 8080` (run from the project folder) does the same thing.

**Why not just double-click `index.html`?**
The app uses JavaScript "modules" (code split into several files). Browsers refuse to load modules from a file opened directly from disk (`file:///...`). It must be served over `http://`, which is what `serve.js` does.

---

## 3. Put it on GitHub Pages

GitHub is a website for storing code. **GitHub Pages** is its free feature that turns a repository (a project folder on GitHub) into a website.

### 3a. Create an account and a repository

1. Go to **https://github.com** and click **Sign up** if you don't have an account. Pick your username carefully — it becomes part of your blog's address.
2. Once signed in, click the **+** in the top-right corner → **New repository**.
3. **Repository name:** `my-blog` (or any name you like — this is your `<repo>`).
4. Choose **Public**.
   GitHub Pages on a free account only works with public repositories. That's fine: there are no secrets in the code. (See the note in step 4 about the Google keys.)
5. Leave the other options alone and click **Create repository**.

### 3b. Upload the files — Option A: through the website (easiest)

1. On your new repository's page, click **Add file → Upload files**.
   (On a brand-new empty repo you may instead see a link that says **uploading an existing file** — click that.)
2. Open the project folder in File Explorer. Select **everything inside it** (Ctrl + A) — all files **and** folders such as `js` and `css` — and drag them onto the GitHub page.
   Use Chrome or Edge; they keep the folder structure when you drag folders.
3. Make sure the small file named **`.nojekyll`** is included. It is an empty file that tells GitHub Pages to serve your files exactly as they are (without it, GitHub may skip some files).
4. Scroll down and click **Commit changes**. ("Commit" just means "save a version".)

### 3b. Upload the files — Option B: with git commands

Only if you prefer the command line. You need **Git for Windows** installed (https://git-scm.com/download/win).
Open Command Prompt in the project folder (as in step 2) and run:

```
git init
git add .
git commit -m "First version of my blog"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

The first time, a window will ask you to sign in to GitHub. Later, to upload changes:

```
git add .
git commit -m "Describe what changed"
git push
```

### 3c. Turn on GitHub Pages

1. In your repository, click **Settings** (top menu of the repo).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **`main`** and folder **`/ (root)`**. Click **Save**.
5. Wait 1–2 minutes, then refresh the page. You'll see "Your site is live at…"

Your blog's address is:

```
https://<username>.github.io/<repo>/
```

Open it. It will still be in Demo mode — that's expected. Next we connect Google.

---

## 4. Google Cloud setup

This is the longest part, but you only do it once. Go to **https://console.cloud.google.com** and sign in with the Google account whose Drive will hold your blog.

> Google moves buttons around from time to time. If a label looks slightly different, look for the closest match — the ideas stay the same.

### 4a. Create a project

A "project" is just a container for your blog's Google settings.

1. At the top of the page, click the **project picker** (next to the "Google Cloud" logo) → **New project**.
2. **Project name:** `My Blog`. Leave "Location" as is.
3. Click **Create**. Wait a few seconds, then make sure the new project is selected in the project picker.

### 4b. Turn on the Google Drive API

An "API" is a door that lets an app talk to a Google service. We need the Drive one.

1. Open the menu (☰, top left) → **APIs & Services → Library**.
2. Search for **Google Drive API**, click it, then click **Enable**.

### 4c. Set up the sign-in screen (Google Auth Platform)

This is the screen you'll see when you click "Sign in with Google".

1. Open the menu (☰) → **Google Auth Platform** (you can also type "Google Auth Platform" in the search bar at the top).
2. If you see **Get started**, click it and fill in:
   - **App Information:** App name `My Blog`; User support email = your Gmail. Click **Next**.
   - **Audience:** choose **External**. Click **Next**.
   - **Contact Information:** your Gmail. Click **Next**.
   - **Finish:** tick the box to agree to the Google API Services User Data Policy, then click **Continue** and **Create**.

   (If the app was already set up, you'll see these settings in the **Branding** section instead.)
3. In the left sidebar, click **Audience**.
   - **Publishing status** should say **Testing**. Leave it that way.
   - Under **Test users**, click **+ Add users**, type **your own Gmail address**, and click **Save**.

   **Why Testing?** In Testing mode, only the test users you list can sign in. That's exactly what we want: you are the only person who writes. Visitors never sign in — they just read.
4. In the left sidebar, click **Data Access** → **Add or remove scopes**.
   - A "scope" is a single permission the app asks for.
   - Find and tick **`.../auth/drive.file`** (described as "See, edit, create, and delete only the specific Google Drive files you use with this app"). If it's not in the list, paste `https://www.googleapis.com/auth/drive.file` into **Manually add scopes** and click **Add to table**.
   - Click **Update**, then **Save**.

### 4d. Create the OAuth client (the "Client ID")

The Client ID tells Google "sign-in requests from my blog are allowed".

1. In Google Auth Platform's left sidebar, click **Clients** → **+ Create client**.
2. **Application type:** **Web application**. **Name:** `My Blog website`.
3. Under **Authorized JavaScript origins**, click **+ Add URI** and add these two, one per line:

   ```
   https://<username>.github.io
   http://localhost:8080
   ```

   Important: an "origin" is just the start of the address. **No** `/<repo>` path and **no** slash at the end.
4. Leave **Authorized redirect URIs** empty. This app doesn't need any.
5. Click **Create**.
6. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). You can always find it again under **Clients**.
7. Open `js/config.js` in Notepad and paste it between the quotes:

   ```js
   googleClientId: "1234567890-abc...apps.googleusercontent.com",
   ```

### 4e. Create the API key (for visitors)

Visitors aren't signed in, so the app uses an "API key" to read your public posts on their behalf.

1. Open the menu (☰) → **APIs & Services → Credentials**.
2. Click **+ Create credentials → API key**. Give it a name like `My Blog public key` if asked.
3. Restrict the key so nobody else can use it from their own site:
   - **Application restrictions:** choose **Websites**. Under **Website restrictions**, click **Add** and add:

     ```
     https://<username>.github.io/*
     http://localhost:8080/*
     ```

   - **API restrictions:** choose **Restrict key** and tick **Google Drive API** only.
4. Click **Save** (or **Create**). Copy the key (it starts with `AIza`).
5. Paste it into `js/config.js`:

   ```js
   googleApiKey: "AIza...",
   ```

**"Is it safe that these are in a public repo?"** Yes. The Client ID and API key are *designed* to be visible in web pages — every website that uses Google sign-in shows them. What protects you is the restrictions you just set: the Client ID only works from your two origins, only your test-user account can sign in, and the API key only works from your site and only for Drive. Your Google password is never in the code.

### 4f. Upload the updated config

Save `js/config.js`, then put it on GitHub:

- **Website way:** in your repo, open the `js` folder → click `config.js` → click the **pencil icon** (Edit) → paste in your new content → **Commit changes**. (Or use **Add file → Upload files** and upload `config.js` into the `js` folder.)
- **Git way:** `git add .` → `git commit -m "Add Google settings"` → `git push`

GitHub Pages updates in about 1–2 minutes. Press **Ctrl + F5** on your blog to force a fresh reload.

---

## 5. First sign-in

1. Open `https://<username>.github.io/<repo>/`.
2. Click **Sign in with Google** and choose your account.
3. You'll see a warning: **"Google hasn't verified this app"**.
   This is normal for your own app in Testing mode — Google simply hasn't reviewed it, and it doesn't need to, since only you use it.
   Click **Advanced** → **Go to My Blog (unsafe)**.
4. Allow the permission to see and manage the files this app creates.
5. The app creates a folder called **My Blog** in your Google Drive. You're now signed in and can write posts.

---

## 6. Let visitors read your public posts

One last setting so people who aren't signed in can see your Public posts.

1. While signed in, click the **gear icon** (Settings) in the app.
2. Find **Public feed file ID** and copy it. (This is the ID of `public-posts.json` in your Drive.)
3. Paste it into `js/config.js`:

   ```js
   publicIndexFileId: "1AbC...xyz",
   ```

4. **Optional:** set `ownerEmail` to your Gmail address. Then only that account sees the editor, even if someone else somehow signs in.

   ```js
   ownerEmail: "you@gmail.com"
   ```

5. Upload `js/config.js` again (same as step 4f).
6. Test it: open your blog in a **private/incognito window** (Ctrl + Shift + N in Chrome/Edge). You should see your Public posts without signing in.

You can also change `blogTitle` and `tagline` in the same file at any time.

---

## 6b. Optional: show what you're listening to (Last.fm)

A slim "Listening now" / "Last played" strip appears above your posts, with the album art. Tapping it opens the track on Last.fm. It refreshes every minute.

**Connect your account (in the app):**
1. Sign in, open **Settings** (gear icon) → **Last.fm**.
2. Type your Last.fm username and tap **Connect**. Your username is saved in your own Google Drive (in `posts.json`), not in the code.
3. By default **only you** see the strip, and it shows a small lock. To show it to visitors, turn on **Show on my public blog**.
4. **Disconnect Last.fm** removes it.

**One-time: the API key in `js/config.js`.** The app needs one Last.fm API key so it can read listening data. It's already filled in (`lastfmApiKey`). If you'd rather use a different one, create a key at https://www.last.fm/api/account/create and paste it there.
- **Only the API key goes in the config, never the "Shared secret".** The shared secret is for scrobbling and must stay private, and this code is public.
- If the strip doesn't show, check that your Last.fm profile doesn't have **Hide recent listening information** turned on (Last.fm → Settings → Privacy).

---

## 7. Day-to-day use

**Writing a post**
1. Sign in. Click **New post** (on a phone, the round orange **+** button at the bottom right) and pick a type:
   - **Thought** — a titled post written in Markdown (simple formatting: `**bold**`, `*italic*`, `# Heading`, `- list`).
   - **Photo** — one or more images plus a caption.
   - **Video** — upload a video file, or paste a YouTube/Vimeo link.
   - **Link** — a web address, a title and your comment.
   - **Note** — a quick short note.
2. Add **tags** if you like (they help group posts).
3. Choose **Public** or **Private** at the bottom, then tap **Publish** (Private posts are saved only for you).

**Public vs Private**
- **Public:** visible to everyone. The post is copied into `public-posts.json`, and its photos/videos are shared as "Anyone with the link can view".
- **Private:** only you see it when signed in. Its media stays private in your Drive.
- You can switch a post between Public and Private at any time; sharing is updated automatically.

**Editing and deleting**
- Every post has **Edit** (pencil) and **Delete** (bin) buttons in its top-right corner.
- Tap the **Public / Private** badge on a post to switch it.
- Deleting moves the post's photos/videos to your **Google Drive trash** (so you can still recover them for 30 days).

**Where your files live**
- In Google Drive → **My Blog** folder: `posts.json` (all posts), `public-posts.json` (public posts only), and your uploaded media.
- Please don't rename, move or edit these files by hand — the app relies on them.

**Sharing a single post**
- Every post has its own link, ending in `#/post/<id>`, for example
  `https://<username>.github.io/<repo>/#/post/abc123`.
- Only Public posts can be opened by other people.

**Photo size**
- Photos are automatically shrunk to at most **2400 pixels** on the longest side before upload. They still look sharp, but take much less Drive space.

---

## 8. Troubleshooting

| Problem | What it means / what to do |
|---|---|
| **"redirect_uri_mismatch"** or **"origin not allowed"** | The address you opened isn't in **Authorized JavaScript origins** (step 4d). Check for typos: it must be exactly `https://<username>.github.io` — no path, no trailing `/`, `https` not `http`. After any change, **wait about 5 minutes**, then reload. |
| **"Access blocked: … has not completed the Google verification process"** or **"not a test user"** | The Google account you're signing in with isn't on the **Test users** list. Add it under Google Auth Platform → **Audience → Test users** (step 4c). |
| Visitors see **"No public posts yet"** | Either `publicIndexFileId` is empty/wrong in `js/config.js` (step 6), or the post isn't marked **Public**. Also remember GitHub Pages takes 1–2 minutes to update; press Ctrl + F5. |
| **Error 403** when visitors load posts, or messages about the API key | The API key's website restriction doesn't match your site. It must include `https://<username>.github.io/*` (with the `/*`). Also check the key is restricted to **Google Drive API** and that the Drive API is **enabled** (step 4b). Changes can take a few minutes. |
| Large video uploads are slow or fail | Videos over about **100 MB** may upload slowly or run into Drive limits, and they play less smoothly for visitors. For long videos, upload them to YouTube (can be "Unlisted") and use a **Video post with the YouTube link** instead. |
| Asked to sign in again after a while | Google's sign-in lasts **1 hour**, and each new browser tab needs one tap on **Sign in with Google**. When it runs out, the app asks again the next time you save (or shows a **Sign in** message). If your browser blocks pop-ups, allow them for your blog's address. |
| Site still shows **Demo mode** after adding settings | Your browser is showing an old copy. Press **Ctrl + F5**. Make sure the edited `js/config.js` was actually uploaded to GitHub (open it in your repo and check). |
| Blank page or broken layout on GitHub Pages | Check that the `js` and `css` folders were uploaded with their files inside, and that `.nojekyll` is in the top level of the repo. |
| `node` is not recognized | Node.js isn't on your PATH. Reinstall Node.js from https://nodejs.org (LTS version) and reopen Command Prompt. |

---

## 9. Why Google Drive and not iCloud?

Apple's only way for a website to use iCloud storage is **CloudKit JS**. It requires a paid **Apple Developer Program** membership (**$99 per year**) and a lot more setup (containers, record types, server keys). Google Drive works **for free** from a simple static site like this one, with just the steps above.
