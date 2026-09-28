# Krish Bansal: Netflix-style Portfolio

A Netflix-inspired portfolio: animated intro → **Who's watching?** (picking a profile plays an
original "ta-dum" sting synthesized with the Web Audio API, no audio files) → a personalized
home screen of education, experience, projects, and skills.

**Live:** https://krishbansalofficial.github.io/

| Profile | What it shows |
| --- | --- |
| **Recruiter** | The resume cut: a "Krish Bansal" series billboard with Resume/Contact buttons, a Top 5 row, work experience, education, projects, skills. |
| **Krish** | The director's cut: featured project, "Continue Watching", ML & quant picks, and throwbacks (OpenDSA, VEX U, VT Housing). |

## Run it

```bash
npm install
npm start               # http://localhost:3000
npm run dev             # auto-restart on server changes
npm test                # API tests (node:test, no extra deps)
```

Optional environment variables:

| Var | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default `3000`). |
| `ADMIN_TOKEN` | Enables `/api/admin/*`. Without it, admin endpoints always return 401. |

## Editing content

All content lives in **`data/portfolio.json`**:

- `owner`: name, email, links, and resume path. `owner.facts` are the chips under the
  Recruiter billboard (degree, graduation, GPA); `owner.availability`, when set, adds a green
  "open to" chip in front of them. The picker also links the resume PDF directly.

- `items`: every title (education, experience, project, skills) is defined **once**.
  `art.from`/`art.to` set the card gradient; `art.glyph` is the big background lettering;
  `badge` is the red corner tag.
- `profiles[].rows`: each profile is an ordered list of rows referencing item ids.
  `variant: "ranked"` gives the Top-N numbered row, `"progress"` adds watch bars, and
  `section` makes the row a target for the nav links (Experience, Projects, …).

Optional item fields:

| Field | Effect |
| --- | --- |
| `episodeTitles` | One title per bullet; the detail view shows the bullets as a season of **Episodes**. Must match the bullet count (checked at startup). |
| `progress` | 0–100 watch progress for "Continue Watching" rows. The preview shows the matching episode ("Continue S1:E3 · …"). |
| `trailer` | Path to a short muted clip (e.g. `trailers/regime.webm` in `public/`) that plays in the hover preview. Without one, the card art plays an animated teaser. |
| `lab: "backtest"` | Adds a **Run a Backtest** button that opens Backtest Theater. |

A profile with `"hidden": true` is left out of the picker but still reachable by URL.

The server validates every reference at startup, so a typo'd id fails fast.

## Hidden extras

- **Backtest Theater**: an in-browser SPY backtester (`public/js/backtest-engine.js`) running on
  `public/data/spy.json`. Refresh the prices with `node scripts/fetch-spy.js`.
- **Terminal mode**: press <kbd>`</kbd> anywhere (or *Terminal Mode* in the footer). Try `help`.
- **Konami code** (↑↑↓↓←→←→BA): unlocks the secret Bloopers profile.
- **Are you still watching?**: shown once per session after 2 idle minutes.
Replace `public/Krish_Bansal_Resume.pdf` to update the downloadable resume.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles` | Profiles for the picker |
| GET | `/api/browse/:profileId` | Hero + rows composed for that profile |
| GET | `/api/items/:id` | One title + "More Like This" (tag/genre Jaccard similarity) |
| GET | `/api/search?q=` | Full-text search (all terms must match) |
| POST | `/api/contact` | `{name, email, company?, message}`: validated, honeypot, 5 per 10 min per IP |
| POST | `/api/track` | `{event, target}`: profile_select / item_open / resume_download counters |
| GET | `/api/admin/messages` | Contact inbox (`Authorization: Bearer $ADMIN_TOKEN`) |
| GET | `/api/admin/stats` | Event counters (same auth) |

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/messages
```

Messages and stats are stored as JSON in `storage/` (git-ignored), written atomically.

## Structure

```
server/   app.js (routes, CSP, errors) · catalog.js (profiles, similarity, search)
          jsonStore.js (atomic JSON persistence) · rateLimit.js · index.js
public/   index.html · styles.css · js/main.js (SPA) · js/api.js · js/dom.js · js/sound.js
data/     portfolio.json
test/     api.test.js
```

## Deploying

**GitHub Pages (static):** every push to `main` runs `.github/workflows/pages.yml`, which
tests, runs `npm run build`, and publishes `dist/`. The build pre-renders every read
endpoint to JSON (`dist/api/**`), so the site needs no server. In that mode search
runs in the browser, the contact form opens the visitor's email app, and analytics are off.
Preview it locally with `npm run build` and any static file server pointed at `dist/`.

**Resume from Overleaf:** the deploy workflow can pull your resume straight from Overleaf
(Git integration), compile it with tectonic, and publish it as the downloadable resume, on
every push and once a day. To turn it on, add these repository secrets
(Settings → Secrets and variables → Actions, or `gh secret set NAME`):

| Secret | Value |
| --- | --- |
| `OVERLEAF_PROJECT_ID` | The id in the project URL: `overleaf.com/project/<id>` |
| `OVERLEAF_TOKEN` | Overleaf → Account Settings → Git integration → generate token |
| `OVERLEAF_MAIN_FILE` | Optional; the `.tex` file to compile (default `main.tex`) |

Without the secrets, the committed `public/Krish_Bansal_Resume.pdf` is used.
Run `scripts/overleaf-resume.sh` locally (with the same env vars) to test it.

**Full backend:** any Node 22+ host works (Render, Railway, Fly.io, a VPS). Set `ADMIN_TOKEN`, run `npm start`.
On hosts with ephemeral disks, mount a volume at `storage/` so messages persist.
