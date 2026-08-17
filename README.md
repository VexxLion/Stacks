# Stacks

A small, private "watch later" shelf for YouTube links — independent of the
YouTube app. Share a video to it, tag it with a category and one or more
playlists, and browse a clean list later. Built to sit next to an ad-blocking
browser: tapping a saved link just opens the URL, so it opens wherever your
phone is set to open links (your ad-block browser, if that's your default).

**What this actually is:** a Progressive Web App (PWA) — a website that
installs to your home screen like an app, works offline, and can register
itself as a Share target in Android's share sheet. That last part is exactly
the mechanism the real YouTube app, WhatsApp, etc. all use for "Share to X" —
it's not a workaround, it's the standard Android API for it
(`share_target` in the web app manifest). I built it this way instead of a
native app because it needs zero install-from-Play-Store friction, zero
backend/server, and no build toolchain on your end — you just host four
static files.

All your data (links, categories, playlists) is stored only on your phone,
in the browser's local storage. Nothing is sent anywhere except a title
lookup to YouTube itself (`youtube.com/oembed`) when you save a link.

## 1. Get it online (required for install + share target)

Android requires a PWA to be served over **HTTPS from a real domain** before
it can be installed or registered as a share target — `file://` or a local
network address won't work for this part. The easiest free option:

**GitHub Pages**
1. Create a new GitHub repo, e.g. `stacks`.
2. Upload every file in this folder (keep the `icons/` folder as a subfolder).
3. Repo Settings → Pages → Deploy from branch → `main` / root.
4. Wait ~1 minute, then visit `https://<your-username>.github.io/stacks/`.

Netlify or Cloudflare Pages work the same way if you'd rather drag-and-drop
the folder in a browser — no GitHub account needed.

## 2. Install it on your phone

1. Open the deployed URL in Chrome on Android.
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. Open it once from the home screen icon (this registers it as installed,
   which is what makes it eligible as a share target).

## 3. Share a video to it

1. Open YouTube (app or browser), tap **Share** on any video.
2. Pick **Stacks** from the share sheet.
3. It shows a preview, fetches the title automatically, and lets you pick a
   category and playlist(s) before saving. Tap **Save to shelf**.

If Stacks doesn't show up in the share sheet right away, reboot once —
Android sometimes needs a restart to pick up a newly installed PWA's share
target registration.

## Gestures & shortcuts

- **Single tap** a card → opens the video.
- **Double tap** a card → pins it to the top of the list (tap again to unpin).
- **Swipe right** on a card → marks it watched.
- **Swipe left** on a card → deletes it (a few seconds of **Undo** appear at
  the bottom before it's gone for good — deleting from the edit sheet gives
  the same Undo).
- **Select** (next to the sort control) → turns on checkboxes so you can move
  or delete several links at once.
- Filter down to one **playlist chip** → drag handles (⠿) appear so you can
  reorder that playlist by hand, e.g. to sequence a course.
- **🗄 Archived** chip → watched videos quietly move here after 14 days so
  the main list doesn't pile up; they're still fully searchable there.
- **📊** in the header → quick counts (total saved, watched, saved this week,
  top category).
- **☾ / ☀** in the header → switches between dark and light.
- Opening **+ Add a link** will offer to prefill the URL field if you've
  already got a YouTube link copied to your clipboard.

## 4. Pairing with your ad-block browser

Tapping a saved video in Stacks just opens its normal `youtube.com` URL.
What happens next depends on your phone's link-handling setup:

- If your ad-block browser is set as your **default browser**, Android will
  hand it the link directly.
- If YouTube's app has "Open supported links" turned on, Android may offer
  the YouTube app instead. You can turn that off in
  **Settings → Apps → YouTube → Open by default → Open supported links**
  to force links to your browser instead.

## Files

- `index.html` / `app.js` — the main shelf: list, search, filters, add/edit.
- `share-target.html` / `share.js` — the page Android opens when you share a
  link in.
- `core.js` — shared storage + YouTube link parsing.
- `style.css` — everything visual.
- `manifest.json` — PWA install config + the share target registration.
- `sw.js` — offline caching.
- `icons/` — app icons.

## Backup

Storage is local to the phone + browser, so it won't survive an uninstall or
follow you to a new phone automatically. Use **Export backup** at the bottom
of the list to save a `.json` file, and **Import backup** to restore it
(e.g. after reinstalling, or to move to another device).

## Customizing

Everything is plain HTML/CSS/JS, no build step. Colors and fonts are all
defined as CSS custom properties at the top of `style.css` if you want to
retheme it.
