# Weekly Development Report

**Report period**: Feb 9 – Feb 16, 2025  
**Branch**: main (up to date with origin/main)  
**Last commit**: 015aa33 (Feb 11, 2026) — Embedded Google search, export pipeline, editor UX overhaul

---

## 1. Commits in the Past Week

| Date       | Commit   | Summary                                                |
|------------|----------|--------------------------------------------------------|
| Feb 11     | 015aa33  | Embedded Google search, export pipeline, editor UX overhaul |
| Feb 9      | 731eec7  | Checkpoint for embedding DB and Google search results  |
| Feb 7      | 23777a0  | Shadow overlay successfully added                     |
| Feb 7      | b9fc93f  | Flyer layout: title left-align, price toward center, box-sizing fix |

---

## 2. Uncommitted Changes (Working Directory)

Changes since the last commit (Feb 11) — **not yet committed**.

### 2.1 New Files (Untracked)

| Path | Purpose |
|------|---------|
| `apps/desktop/src/main/ipc/batchIngestToDB.js` | Batch upload to product DB: pHash dedup, Gemini metadata, Storage + Firestore |
| `apps/desktop/src/main/ipc/quotaTracker.js` | Daily quota tracking (Firestore, Gemini, Storage) and limits |
| `apps/desktop/src/main/ingestion/pHashService.js` | Perceptual hashing for duplicate detection |
| `apps/desktop/src/main/ingestion/cloudMonitoring.js` | Cloud Monitoring usage metrics |
| `apps/desktop/src/renderer/db-upload/` | Product Library UI: batch upload, DB stats, Sync, Scan Non-Products |
| `apps/desktop/src/renderer/components/ui/` | Shared UI components |
| `apps/desktop/src/renderer/jobs/DepartmentCard.tsx` | Department card component |
| `apps/desktop/src/renderer/jobs/DepartmentCard.css` | Department card styles |
| `apps/desktop/src/renderer/editor/MergeSelectionDialog.tsx` | Card merge selection dialog |
| `apps/desktop/src/renderer/styles/design-tokens.css` | Design tokens |
| `apps/desktop/firestore.indexes.json` | Firestore indexes config |
| `apps/shared/flyer/layout/autoLayoutCards.ts` | Auto-layout for card-based departments |
| `apps/shared/flyer/layout/layoutCardRows.ts` | Card row layout logic |
| `apps/ingestion-java/` | Java ingestion module (relocated) |

### 2.2 Deleted Files

| Path | Notes |
|------|------|
| `apps/desktop/src/main/ingestion/queryEmbeddingService.js` | Replaced by imageEmbeddingService / searchService |
| `apps/desktop/src/renderer/public/assets/flyer_templates/weekly_v2/p1.png`–`p4.png` | Replaced by `1.png`–`4.png` |
| `firebase webapp/` (entire subtree) | Legacy webapp and server removed |

### 2.3 Modified Files (Summary)

**Main process & ingestion**

- `imageEmbeddingService.js` — Gemini vision for metadata, DeepSeek fallback, `classifyImageAsProduct` for DB scan
- `searchService.js` — Embedding-based search, `searchForDiscountItem`, `buildSearchTokens`
- `JobProcessor.js` — Discount-only mode: DB search per item, multi-image for series items
- `parseDiscountXlsx.js` — Department matching, series detection, DeepSeek parsing
- `parseDiscountText.js` — Series detection, discount parsing
- `firebase.js` — Firebase setup changes

**IPC & config**

- `main.js` — New IPC handlers: batch DB upload, confirm image, scan non-products, quota, sync
- `preload.cjs` — Exposes new IPC channels
- `vectorConfig.js` — Minor updates

**Renderer**

- `App.tsx` — Job queue, department overview, editor sync, discount labels
- `EditorCanvas.tsx` — Card layout, slot overlays, merge, swap, DB/Google search integration
- `RenderFlyerPlacements.tsx` — Multi-image grid for series, label rendering
- `SlotOverlays.tsx` — Slot UI updates
- `DepartmentOverview.tsx` — Department cards, status
- `JobCreationPanel.tsx` — Image + discount input, template/department select
- `JobQueueView.tsx` — Job creation, queue, export
- `ExportModal.tsx`, `ExportWarningDialog.tsx`, `FlyerExportRenderer.tsx` — Export flow
- `DiscountDetailsDialog.tsx` — Discount edit dialog
- `AddImageModal.tsx`, `DbSearchModal.tsx`, `GoogleSearchModal.tsx` — Image source modals

**Templates**

- `weekly_v2.config.json` — Template config updates
- Page images: `p1.png`–`p4.png` removed, `1.png`–`4.png` added

---

## 3. Feature Summary

### Product Library (DB Upload)

- Batch upload with pHash deduplication
- Gemini vision for metadata extraction (with DeepSeek fallback)
- User confirmation when Gemini returns no usable parsed data
- Scan Non-Products: Gemini-based check of all DB images, deletion of non-products
- Sync DB: Consistency check and fix (orphaned docs, missing storage, stuck pending)

### Discount-to-Flyer Pipeline

- XLSX or paste input → parse → semantic search per item
- Series support: multi-flavor items fetch multiple DB images, rendered in a grid
- Discount-only jobs: no user images, images fetched from product DB

### Editor & Export

- Department-based job queue and overview
- Card layout with auto-assignment and merge/swap
- Export to PDF with readiness checks

### Cleanup

- `firebase webapp/` legacy webapp and server removed
- `queryEmbeddingService.js` removed; logic moved into search/imageEmbedding

---

## 4. Diff Stats

| Scope            | Files changed | Insertions | Deletions |
|------------------|---------------|------------|-----------|
| apps/desktop/    | 44            | 4,275      | 1,441     |
| firebase webapp/ | 112           | 0          | ~28,764   |
| Total            | 156           | 4,307      | 30,205    |

---

## 5. Notable Technical Changes

1. **Embedding stack**: Ollama `nomic-embed-text` for semantic search; embedding cache in Firestore.
2. **Metadata extraction**: Gemini vision primary; DeepSeek text fallback when OCR has text.
3. **Quota tracking**: Local JSON file for Firestore reads/writes, Gemini requests, Storage uploads.
4. **Series detection**: Keywords (series, assorted, variety, flavor, etc.) used to fetch multiple DB images per discount item.
