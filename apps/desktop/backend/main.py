"""
PyInstaller entry point for the cutout_service backend.

Build with:
  cd apps/desktop/backend
  pyinstaller cutout_service.spec

The resulting binary accepts --host and --port arguments.
"""
import argparse
import sys
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="UFM cutout service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=17890)
    args, _ = parser.parse_known_args()

    uvicorn.run(
        "cutout_service.server:app",
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
