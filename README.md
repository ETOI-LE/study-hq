# Study HQ

A study app for IB Diploma (and other) students: focus sessions, a mistake log with redo mode, a topic tracker and a Today screen that suggests what to do next. Phase 1 of the spec in "Goal and context".

**Live link:** https://etoi-le.github.io/study-hq/ (hosted on GitHub Pages from this repo; push to `main` to update it).

## How data is stored

Each person's data lives only in their own browser (IndexedDB, including photos). Nothing is sent to a server, there is no sign-up, and no analytics. Friends who open the same link each get their own empty app. To move data between devices, use Settings › Backups › Export everything, then Import on the other device.

## Running it locally

```bash
python3 -m http.server 8417
```

Then open http://localhost:8417.

## Sharing it with friends

It's a static site with no build step, so any static host works. For example: GitHub Pages (push this folder to a repo, then Settings › Pages), or Netlify Drop (drag this folder onto app.netlify.com/drop). Offline support (the service worker) switches on automatically over https.

## Files

- `index.html`, `css/styles.css`: the shell and styles
- `js/app.js`: routing, navigation, keyboard shortcuts (N, S, /)
- `js/store.js`, `js/db.js`: state and IndexedDB storage
- `js/logic.js`: smart logic (redo schedule, topic priority, Today suggestions)
- `js/session.js`: focus timer engine (timestamp-based, sounds scheduled on the Web Audio clock)
- `js/views/*`: onboarding, Today, Focus, Mistakes, Topics, Settings
- `js/backup.js`, `js/sample.js`, `js/data-ib.js`: backups, sample data, IB subjects and topics
- `sw.js`, `manifest.webmanifest`: offline support and install as an app
