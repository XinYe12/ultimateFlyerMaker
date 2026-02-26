# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the UFM cutout_service backend.
#
# Build (from apps/desktop/backend/):
#   source .venv/bin/activate
#   pyinstaller cutout_service.spec
#
# Output: dist/cutout_service/cutout_service  (one-dir layout)
# Copy the whole dist/cutout_service/ folder into Electron's extraResources.

block_cipher = None

a = Analysis(
    ["main.py"],
    pathex=["src"],
    binaries=[],
    datas=[],
    hiddenimports=[
        # uvicorn internals that are loaded dynamically
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # starlette / fastapi
        "starlette",
        "starlette.routing",
        "fastapi",
        "anyio",
        "anyio._backends._asyncio",
        # image / ML
        "PIL",
        "PIL.Image",
        "rembg",
        "onnxruntime",
        # paddleocr (heavy; include if OCR endpoint needed in the binary)
        "paddleocr",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,  # one-dir layout — keeps startup fast with large ML libs
    name="cutout_service",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,   # UPX can corrupt ML / native libs
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="cutout_service",
)
