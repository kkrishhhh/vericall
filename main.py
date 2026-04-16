"""Root ASGI entrypoint so `uvicorn main:app` works from repository root."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

_ROOT = Path(__file__).resolve().parent
_BACKEND_MAIN = _ROOT / "backend" / "main.py"
_BACKEND_DIR = _ROOT / "backend"

if not _BACKEND_MAIN.exists():
    raise RuntimeError(f"Backend entrypoint not found: {_BACKEND_MAIN}")

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

_spec = importlib.util.spec_from_file_location("backend_main_app", _BACKEND_MAIN)
if _spec is None or _spec.loader is None:
    raise RuntimeError("Unable to load backend/main.py")

_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

app = _module.app
