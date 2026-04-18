"""RBAC Middleware — Role-Based Access Control with JWT authentication.

Roles (ordered by privilege):
    CUSTOMER < PFL_OFFICER < PFL_MANAGER < PFL_ADMIN

Demo credentials (hardcoded for hackathon):
    officer  / officer123  → PFL_OFFICER
    manager  / manager123  → PFL_MANAGER
    admin    / admin123    → PFL_ADMIN

Usage:
    @app.get("/api/protected", dependencies=[Depends(require_role(Role.PFL_OFFICER))])
    async def protected_endpoint():
        ...
"""

import os
import time
from enum import IntEnum
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel


# ── Roles ────────────────────────────────────────────────────────

class Role(IntEnum):
    """Roles ordered by ascending privilege level."""
    CUSTOMER = 0
    PFL_OFFICER = 1
    PFL_MANAGER = 2
    PFL_ADMIN = 3


# ── JWT Config ───────────────────────────────────────────────────

JWT_SECRET = os.environ.get("JWT_SECRET", "vantage-demo-secret-key-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

_security = HTTPBearer(auto_error=False)


# ── Demo Credentials ─────────────────────────────────────────────

DEMO_USERS = {
    "officer": {"password": "officer123", "role": Role.PFL_OFFICER, "name": "Officer Demo"},
    "manager": {"password": "manager123", "role": Role.PFL_MANAGER, "name": "Manager Demo"},
    "admin":   {"password": "admin123",   "role": Role.PFL_ADMIN,   "name": "Admin Demo"},
}


# ── Models ───────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str
    name: str
    expires_in: int  # seconds


# ── Token Functions ──────────────────────────────────────────────

def create_token(username: str, role: Role, name: str = "") -> str:
    """Create a signed JWT token embedding the user's role."""
    payload = {
        "sub": username,
        "role": role.value,
        "role_name": role.name,
        "name": name,
        "iat": int(time.time()),
        "exp": int(time.time()) + (JWT_EXPIRY_HOURS * 3600),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Auth Dependency ──────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> dict:
    """Extract and validate the current user from the Bearer token.

    Returns the decoded JWT payload dict with keys: sub, role, role_name, name.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return decode_token(credentials.credentials)


def require_role(minimum_role: Role):
    """FastAPI dependency that enforces a minimum role level.

    Usage:
        @app.get("/api/admin", dependencies=[Depends(require_role(Role.PFL_MANAGER))])

    Any user with a role >= minimum_role will pass. Others get 403 Forbidden.
    """
    def role_checker(user: dict = Depends(get_current_user)):
        user_role = Role(user.get("role", 0))
        if user_role < minimum_role:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required: {minimum_role.name}, You: {user_role.name}",
            )
        return user
    return role_checker


# ── Login Handler ────────────────────────────────────────────────

def authenticate_user(username: str, password: str) -> LoginResponse:
    """Authenticate a user against demo credentials. Returns JWT on success."""
    user = DEMO_USERS.get(username.lower())
    if not user or user["password"] != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(username, user["role"], user["name"])
    return LoginResponse(
        token=token,
        role=user["role"].name,
        name=user["name"],
        expires_in=JWT_EXPIRY_HOURS * 3600,
    )
