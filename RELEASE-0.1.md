# Ultimate Flyer Maker — 0.1 Release Checklist

Ordered by dependency. Each item has **pass/fail** criteria you can tick off.

**Version target:** `0.1.0` (see `apps/desktop/package.json`)

### Release decisions (locked)

| Item | Choice |
|------|--------|
| **0.1 Audience** | Internal pilot (dev + 1 store) |
| **0.2 Golden path template** | Built-in `weekly_v1` first; imported custom template in Phase 3 |
| **0.3 Scope** | Freeze features until checklist green |

---

## Phase 0 — Define the bar (~30 min)

| # | Task | Pass | Fail |
|---|------|------|------|
| 0.1 | Pick release audience | **Internal pilot** (you + 1 store) OR **External 0.1** (installer for non-devs) | Unclear who it's for |
| 0.2 | Pick primary template path | Built-in `weekly_v1` / `weekly_v2` **or** imported custom template — one is the "golden path" for QA | Testing everything equally with no priority |
| 0.3 | Freeze scope | No new features until checklist is green | Adding features mid-QA |

**Gate:** You can name one user, one template, one happy-path workflow.

**Status:** Done (2026-06-25) — decisions locked in table above.

---

## Progress log

Track completed steps here. Update after each working session.

| Date | Step | Result | Notes |
|------|------|--------|-------|
| 2026-06-25 | **0.1–0.3** Phase 0 | Pass | Audience: internal pilot; golden path: `weekly_v1`; scope frozen |
| 2026-06-25 | **1.1** PyInstaller build | Pass | `backend/dist/cutout_service/cutout_service.exe` via `pyinstaller cutout_service.spec` |
| 2026-06-26 | **1.1b** PyInstaller fix | Pass | Added `cutout_service`/`ocr` hiddenimports + `copy_metadata` for pymatting/rembg; eager import in `main.py` |
| 2026-06-26 | **1.2** Bundled binary in package | Pass | Packaged app logs `Using bundled binary: ...\cutout_service.exe` |
| 2026-06-26 | **1.3** Backend health (cold start) | Pass | `/health` ready in ~45s on packaged `win-unpacked` build |
| 2026-06-26 | **1.5** `dist:win` | Pass | `dist-win/Ultimate Flyer Maker Setup 0.1.0.exe` (~448 MB) |
| 2026-06-26 | **1.4** OCR + cutout smoke (packaged) | Pending | Drop one product image in packaged build; confirm cutout path returned |
| 2026-06-26 | **1.6** Clean-machine install | Pending | Install NSIS on PC without Python |

**Artifacts (latest build):**
- Installer: `apps/desktop/dist-win/Ultimate Flyer Maker Setup 0.1.0.exe`
- Unpacked: `apps/desktop/dist-win/win-unpacked/Ultimate Flyer Maker.exe`
- Backend bundle: `apps/desktop/backend/dist/cutout_service/`

**Next up:** 1.4 (image ingest smoke) → 1.6–1.7 (clean-machine + keys) → Phase 2A golden-path QA.

---

### 1A. Python backend bundle

| # | Task | Pass | Fail |
|---|------|------|------|
| 1.1 | Build PyInstaller binary from `apps/desktop/backend/cutout_service.spec` | `apps/desktop/backend/dist/cutout_service/cutout_service.exe` exists (Windows) | Only `.spec` file, no `dist/` |
| 1.2 | Verify packaged app finds binary | Fresh `dist:win` install logs `Using bundled binary:` on startup | Falls back to `PYTHON_BIN` / backend fails |
| 1.3 | Backend health on cold start | App reaches main UI within 60s; `/health` OK | Splash hangs or cutout/OCR unavailable |
| 1.4 | OCR + cutout smoke test in packaged build | Drop one product image → cutout path returned | Silent failure or "Backend not started" |

### 1B. Windows installer

| # | Task | Pass | Fail |
|---|------|------|------|
| 1.5 | `npm run dist:win` from `apps/desktop/` on clean machine | NSIS installer builds without manual steps | Requires dev env hacks |
| 1.6 | Install on machine **without** Python | App launches and processes images | Requires `PYTHON_BIN` in `.env` |
| 1.7 | `.env` / config handling | First-run setup prompts for required keys; keys persist across restart | Crash on missing keys with no guidance |
| 1.8 | Firebase creds (if Product Library in scope) | Bundled or documented `service-key.json` path works | DB search/upload broken with no message |

### 1C. Dev artifacts removed

| # | Task | Pass | Fail |
|---|------|------|------|
| 1.9 | Remove/guard debug telemetry | No `127.0.0.1:7335` calls in production build | Debug ingest URLs in shipped binary |
| 1.10 | DevTools | DevTools **not** auto-opened when packaged | `openDevTools()` in production |

**Phase 1 gate:** Install on a clean Windows PC → app opens → one image ingests successfully **without** dev tooling.

---

## Phase 2 — Golden path QA (core product)

Use one real weekly flyer scenario. Suggested path: **built-in template first**, then repeat with **imported custom template**.

### 2A. Template → queue

| # | Task | Pass | Fail |
|---|------|------|------|
| 2.1 | Home → Make a Flyer | Template select loads built-ins + customs | Blank/broken thumbnails |
| 2.2 | Create department jobs | Each department in template appears in queue | Missing/wrong departments |
| 2.3 | Discount upload (text) | Products parse into job with titles/prices | Empty or garbage fields |
| 2.4 | Discount upload (XLSX) | Same as 2.3 from spreadsheet | Parser errors / wrong columns |
| 2.5 | Bulk XLSX (optional) | Multi-dept file populates multiple jobs | Only first dept filled |

### 2B. Processing pipeline

| # | Task | Pass | Fail |
|---|------|------|------|
| 2.6 | Start job / automation | Images process; progress visible | Stuck "processing" forever |
| 2.7 | Cutout quality | Product on transparent/white background usable in cells | Broken paths / missing images |
| 2.8 | Discount matching | Prices land on correct slots | Systematic mismatches |
| 2.9 | Cancel / retry | Cancel job doesn't corrupt draft | Zombie jobs, duplicate items |
| 2.10 | Draft persistence | Quit app → reopen → draft restored | Lost work |

### 2C. Editor

| # | Task | Pass | Fail |
|---|------|------|------|
| 2.11 | Open department in editor | Flyer canvas + products visible | Wrong page/dept layout |
| 2.12 | Manual edits | Move/replace image, edit text/price sticks after save | Reverts on navigation |
| 2.13 | DB search (if in scope) | Find product → insert into slot | Search errors / no results |
| 2.14 | Verify flow | "Verify" marks dept reviewed | State lost on switch dept |
| 2.15 | Lock department | Locked dept blocks accidental clears | Can still wipe locked dept |
| 2.16 | Undo/redo | Last 3–5 operations undo correctly | No-op or corrupt layout |
| 2.17 | All departments | Repeat 2.11–2.16 for **every** dept in template | One dept works, others broken |

### 2D. Export PDF

| # | Task | Pass | Fail |
|---|------|------|------|
| 2.18 | Workflow bar unlocks export | Step 4 clickable when all depts locked | Blocked despite finished work |
| 2.19 | Export warning dialog | Shows ready vs incomplete depts accurately | Wrong counts |
| 2.20 | PDF generates | File saved with sensible name | Crash / empty PDF |
| 2.21 | PDF content | All pages present; products/prices readable | Clipped text, missing pages |
| 2.22 | PDF opens externally | Opens in Acrobat/Edge without errors | Corrupt file |
| 2.23 | Print spot-check | One physical or 100% zoom print looks acceptable | Blurry/unusable text |

**Phase 2 gate:** One complete flyer exported to PDF on packaged build, no dev console open.

---

## Phase 3 — Import template wizard

| # | Task | Pass | Fail |
|---|------|------|------|
| 3.1 | Upload flyer images | Multi-page import works | Wrong dimensions / missing pages |
| 3.2 | Step 1 — Regions | Draw/move/resize dept regions on real flyer | Regions misaligned vs print |
| 3.3 | Step 2 — Cell style | Cell size controls change visible grid density | One giant cell / controls no-op |
| 3.4 | Target vs rendered size | UI shows consistent grid (target drives rows×cols) | Absurd mismatch (e.g. 24px target, 586px rendered) with no explanation |
| 3.5 | Gap/padding | Adjustments reflect on canvas | Padding ignored on export |
| 3.6 | Step 3 — Editable fields | Text fields placed and styled | Fields missing in editor/export |
| 3.7 | Save template | Survives app restart | Lost from localStorage |
| 3.8 | Use imported template in golden path | Import → Make a Flyer → PDF (repeat Phase 2) | Custom template breaks editor/export |
| 3.9 | Re-edit imported template | Edit wizard reopens with saved state | Fresh/blank wizard |

**Phase 3 gate:** Import a real store flyer → produce one PDF using **only** that custom template.

---

## Phase 4 — Product Library (if in 0.1 scope)

| # | Task | Pass | Fail |
|---|------|------|------|
| 4.1 | Upload images to library | Images appear in list | Upload fails silently |
| 4.2 | Search in editor | `DbSearchModal` returns relevant hits | Always empty / timeout |
| 4.3 | Java ingestion docs | Step for `mvn exec:java` documented (see `CLAUDE.md`) | Only you know how to populate DB |

**If out of scope for 0.1:** hide or label "Beta" on home screen Product Library card.

---

## Phase 5 — UX polish & failure modes

| # | Task | Pass | Fail |
|---|------|------|------|
| 5.1 | Missing API key | Clear error + link to settings | Opaque stack trace |
| 5.2 | Backend down | User-visible message + retry | Infinite spinner |
| 5.3 | Network/LLM failure | Job fails gracefully with message | Hung job |
| 5.4 | Large jobs (50+ products) | Completes or warns before start | OOM / freeze |
| 5.5 | Log file access | "Open Log" works from home | User can't diagnose |
| 5.6 | Quit / recovery | Draft recovery overlay works after crash | Corrupt state |

---

## Phase 6 — Documentation & handoff

| # | Task | Pass | Fail |
|---|------|------|------|
| 6.1 | Install guide | "Install → enter keys → first flyer" in <1 page | Only `CLAUDE.md` for devs |
| 6.2 | Required keys list | `DEEPSEEK_API_KEY` + optional search keys documented (`apps/desktop/.env.example`) | User discovers missing keys mid-job |
| 6.3 | Known limitations | PDF is rasterized; all depts must lock; etc. | Surprises in production |
| 6.4 | Version tag | `0.1.0` in installer matches `package.json` | Mismatched version |

---

## Phase 7 — Sign-off

| # | Task | Pass | Fail |
|---|------|------|------|
| 7.1 | Two clean-machine runs | You + one other person complete golden path | Only works on your dev PC |
| 7.2 | Regression smoke | 30-min re-test after last fix | New bug in export |
| 7.3 | Tag release | Git tag `v0.1.0` + installer artifact archived | Informal zip only |

---

## Suggested order of execution

```
Week 1: Phase 1 (packaging) → Phase 2A–2B (pipeline)
Week 2: Phase 2C–2D (editor + PDF) on packaged build
Week 3: Phase 3 (import wizard) + Phase 2 repeat with custom template
Week 4: Phase 5–7 (polish, docs, sign-off)
```

Compress to **~2 weeks** if Product Library is cut and you stay on built-in templates only.

---

## Minimum viable 0.1 (ship sooner)

Ship only when **all** of these are green:

- [x] **1.1–1.3, 1.5** — packaged app + backend (1.4 smoke + 1.6–1.7 still needed for full Phase 1)
- [ ] **2.1–2.3, 2.6–2.8, 2.11–2.13, 2.15, 2.18–2.22** — one template, one flyer, PDF out
- [ ] **5.1–5.2** — keys + backend errors
- [ ] **6.1–6.3** — one-page user guide

Everything else can be **0.1.1**.

---

## Test run log

Copy one block per run:

```
Date: 2026-06-26
Build: dist:win
Template: weekly_v1 (golden path)
Tester: dev machine

Phase 1: [x] pass  [ ] fail  Notes: 1.1–1.3, 1.5 green; PyInstaller metadata fix applied; 1.4/1.6 pending
Phase 2: [ ] pass  [ ] fail  Notes: ___________
Phase 3: [ ] pass  [ ] fail  Notes: ___________
Export PDF path: ___________
Blockers: none for packaging; 1.4 manual smoke test next
```

---

## Related docs

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` | Dev setup, architecture, env vars |
| `apps/desktop/.env.example` | Required and optional API keys |
| `apps/desktop/package.json` | Version and `dist:win` script |
