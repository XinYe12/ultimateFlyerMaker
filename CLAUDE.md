# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ultimate Flyer Maker is a desktop application for creating grocery flyers. It ingests product images, extracts data via OCR and AI, and assembles them into template-based flyer layouts.

## Development Commands

All commands run from `apps/desktop/`:

```bash
# Start development (React + Electron)
npm run dev

# Start only React dev server (port 5173)
npm run dev:renderer

# Start only Electron (requires renderer running)
npm run dev:electron

# Build for production
npm run build:renderer

# Build Windows distribution
npm run dist:win
```

### Python Backend

The Python backend must be running for image processing. From `apps/desktop/backend/`:

```bash
# Activate virtual environment
source .venv/bin/activate

# Start the backend server
python -m uvicorn cutout_service.server:app --host 127.0.0.1 --port 17890
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                    │
│  src/main/main.js, preload.cjs, IPC handlers               │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
      IPC Events                    Spawns Python Backend
               │                              │
               │                    FastAPI (port 17890)
               │                    - /cutout (rembg)
               │                    - /ocr (PaddleOCR)
               │                              │
       ┌───────▼──────────────────────────────┘
       │   REACT RENDERER (Vite :5173)
       │   App.tsx → EditorCanvas
       └───────────────────────────────────────
```

### Key Data Flows

**Image Ingestion**: User drops image → `ufm:ingestPhoto` IPC → OCR (PaddleOCR) → LLM parsing (DeepSeek) → Background removal (rembg) → Layout sizing → Returns `IngestResult`

**Discount Matching**: Upload discount list → `parseDiscountText.js` or `parseDiscountXlsx.js` → DeepSeek LLM extraction → `matchDiscountToSlots.js` → `exportDiscountImages.js` renders labels

### Key Directories

| Component | Location |
|-----------|----------|
| Electron main process | `apps/desktop/src/main/` |
| React renderer | `apps/desktop/src/renderer/` |
| IPC handlers | `apps/desktop/src/main/ipc/` |
| Ingestion pipeline | `apps/desktop/src/main/ingestion/` |
| Python backend | `apps/desktop/backend/src/` |
| Shared layout/models | `apps/shared/flyer/` |
| Flyer templates | `apps/desktop/src/renderer/public/assets/flyer_templates/` |

### IPC Channels

Main IPC events exposed via `preload.cjs`:
- `ufm:ingestPhoto` - Process dropped product image
- `ufm:parseDiscountText` - Parse discount list from text
- `ufm:parseDiscountXlsx` - Parse discount list from Excel
- `ufm:exportDiscountImages` - Render price labels as PNG
- `match-discount-to-slots` - Match products to flyer slots

## Environment Variables

Required in `apps/desktop/.env`:
```
DEEPSEEK_API_KEY=sk-...
PYTHON_BIN=/path/to/python3.11
UFM_PORT=17890
UFM_HOST=127.0.0.1
OPENAI_API_KEY=sk-... (optional backup)
```

## Tech Stack

- **Frontend**: Electron 30, React 19, TypeScript, Vite
- **Backend**: Python 3.11, FastAPI, PaddleOCR, rembg (background removal)
- **AI**: DeepSeek API for product/price extraction
- **Image Processing**: @napi-rs/canvas, OpenCV
- **Data**: Firebase Admin SDK, xlsx parser

## Monorepo Notes

- `firebase webapp/` is a legacy project (archived)
- Root `package.json` has shared ML dependencies (@huggingface/transformers)
- No monorepo tooling (lerna/nx) - uses manual path references
