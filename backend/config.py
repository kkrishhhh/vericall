from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent
_env_path = ROOT_DIR.parent.joinpath(".env")
# Prefer an explicit load from the repository root and allow reloader subprocesses
# to pick up the same variables by forcing override. Also call load_dotenv() as a
# fallback so dotenv can search the current working directory if needed.
load_dotenv(str(_env_path), override=True)
load_dotenv(override=True)


def _env(name: str, default: str | None = None, required: bool = False) -> str | None:
    value = os.environ.get(name, default)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            raise RuntimeError(f"Missing required environment variable: {name}")
        return default
    return value.strip()


def _env_int(name: str, default: int | None = None, required: bool = False) -> int | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        if required and default is None:
            raise RuntimeError(f"Missing required environment variable: {name}")
        return default
    try:
        return int(raw.strip())
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer") from exc


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


APP_HOST = _env("APP_HOST", default="0.0.0.0")
APP_PORT = _env_int("APP_PORT", default=8001)
APP_RELOAD = _env_bool("APP_RELOAD", default=False)

FRONTEND_BASE_URL = _env("FRONTEND_BASE_URL", required=True)

GROQ_API_KEY = _env("GROQ_API_KEY", required=True)
JWT_SECRET = _env("JWT_SECRET", required=True)
JWT_ALGORITHM = _env("JWT_ALGORITHM", default="HS256")
JWT_EXPIRY_HOURS = _env_int("JWT_EXPIRY_HOURS", default=8)

GROQ_LLM_MODEL = _env("GROQ_LLM_MODEL", default="llama-3.3-70b-versatile")
ORCHESTRATOR_MODEL = _env("ORCHESTRATOR_MODEL", default=GROQ_LLM_MODEL)
EXTRACTION_MODEL = _env("EXTRACTION_MODEL", default=GROQ_LLM_MODEL)
VISION_MODEL = _env("VISION_MODEL", default="meta-llama/llama-4-scout-17b-16e-instruct")
CHROMA_EMBEDDING_MODEL = _env("CHROMA_EMBEDDING_MODEL", default="sentence-transformers/all-MiniLM-L6-v2")
RBI_TEXT_PATH = _env("RBI_TEXT_PATH", default=str(ROOT_DIR.parent.joinpath("data", "rbi_kyc_master_direction_2016.txt")))

BREVO_USER = _env("BREVO_USER")
BREVO_PASS = _env("BREVO_PASS")
BREVO_SENDER_EMAIL = _env("BREVO_SENDER_EMAIL")
BREVO_SENDER_NAME = _env("BREVO_SENDER_NAME")
BREVO_SMTP_HOST = _env("BREVO_SMTP_HOST")
BREVO_SMTP_PORT = _env_int("BREVO_SMTP_PORT")

DEEPGRAM_API_KEY = _env("DEEPGRAM_API_KEY")
DEEPGRAM_ALLOW_BROWSER_KEY = _env_bool("DEEPGRAM_ALLOW_BROWSER_KEY", default=False)

OTP_PROVIDER = _env("OTP_PROVIDER", default="noop")
OTP_MAX_SENDS_PER_WINDOW = _env_int("OTP_MAX_SENDS_PER_WINDOW", default=3)
OTP_SEND_WINDOW_MINUTES = _env_int("OTP_SEND_WINDOW_MINUTES", default=30)
OTP_MAX_FAILED_ATTEMPTS = _env_int("OTP_MAX_FAILED_ATTEMPTS", default=5)
OTP_LOCKOUT_MINUTES = _env_int("OTP_LOCKOUT_MINUTES", default=15)

DEV_EXPOSE_KYC_OTP = _env_bool("DEV_EXPOSE_KYC_OTP", default=False)
OTP_VALIDITY_MINUTES = _env_int("OTP_VALIDITY_MINUTES", default=10)
KYC_LINK_VALIDITY_HOURS = _env_int("KYC_LINK_VALIDITY_HOURS", default=24)

DEMO_USERS_JSON = _env("DEMO_USERS_JSON", default="{}")
try:
    DEMO_USERS = json.loads(DEMO_USERS_JSON or "{}")
except json.JSONDecodeError as exc:
    raise RuntimeError("DEMO_USERS_JSON must be valid JSON") from exc


def _validate_runtime_config() -> None:
    if FRONTEND_BASE_URL and not FRONTEND_BASE_URL.startswith(("http://", "https://")):
        raise RuntimeError("FRONTEND_BASE_URL must be a valid http:// or https:// URL")

    if OTP_VALIDITY_MINUTES is not None and OTP_VALIDITY_MINUTES <= 0:
        raise RuntimeError("OTP_VALIDITY_MINUTES must be a positive integer")

    if OTP_MAX_SENDS_PER_WINDOW is not None and OTP_MAX_SENDS_PER_WINDOW <= 0:
        raise RuntimeError("OTP_MAX_SENDS_PER_WINDOW must be a positive integer")

    if OTP_SEND_WINDOW_MINUTES is not None and OTP_SEND_WINDOW_MINUTES <= 0:
        raise RuntimeError("OTP_SEND_WINDOW_MINUTES must be a positive integer")

    if OTP_MAX_FAILED_ATTEMPTS is not None and OTP_MAX_FAILED_ATTEMPTS <= 0:
        raise RuntimeError("OTP_MAX_FAILED_ATTEMPTS must be a positive integer")

    if OTP_LOCKOUT_MINUTES is not None and OTP_LOCKOUT_MINUTES < 0:
        raise RuntimeError("OTP_LOCKOUT_MINUTES must be zero or a positive integer")

    if DEEPGRAM_ALLOW_BROWSER_KEY and not DEEPGRAM_API_KEY:
        raise RuntimeError("DEEPGRAM_API_KEY must be configured when DEEPGRAM_ALLOW_BROWSER_KEY is enabled")


_validate_runtime_config()
