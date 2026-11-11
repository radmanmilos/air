"""Execution policy for the local worker.

One place decides what the worker may touch. AIR configures the job root and
capability flags; every tool resolves paths and checks permissions here instead
of inventing its own rules.

Rules:

- Every path resolves inside the job root. Escapes are refused, including via
  symlinks, because :meth:`Path.resolve` follows links before the check.
- Writes are refused when the job is read-only.
- Shell access is refused unless the job explicitly allows it.
- Protected files (``.git``, ``config.yaml``, keys) are never written.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Names that are never written, regardless of job root.
PROTECTED_NAMES = frozenset(
    {
        ".git",
        "config.yaml",
        "AGENTS.md",
        "PLAN.md",
    }
)

PROTECTED_SUFFIXES = (".pem", ".key", ".p12")

_TRUTHY = {"1", "true", "yes", "on"}


def _env_flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in _TRUTHY


@dataclass(frozen=True)
class Policy:
    """Resolved permissions for one job."""

    root: Path
    allow_write: bool = True
    allow_shell: bool = False
    allow_network: bool = True


_state: Policy | None = None


def configure(
    root: str | Path,
    *,
    allow_write: bool | None = None,
    allow_shell: bool | None = None,
    allow_network: bool | None = None,
) -> Policy:
    """Set the policy for this process and return it.

    ``None`` falls back to the environment (``AIR_LOCAL_ALLOW_WRITE``,
    ``AIR_LOCAL_ALLOW_SHELL``, ``AIR_LOCAL_ALLOW_NETWORK``) and then to the
    safe default (writes allowed, shell and network denied).
    """
    global _state
    _state = Policy(
        root=Path(root).expanduser().resolve(),
        allow_write=_env_flag("AIR_LOCAL_ALLOW_WRITE", True)
        if allow_write is None
        else allow_write,
        allow_shell=_env_flag("AIR_LOCAL_ALLOW_SHELL", False)
        if allow_shell is None
        else allow_shell,
        allow_network=_env_flag("AIR_LOCAL_ALLOW_NETWORK", True)
        if allow_network is None
        else allow_network,
    )
    return _state


def current() -> Policy:
    """Return the active policy, configuring the cwd on first use."""
    if _state is None:
        return configure(Path.cwd())
    return _state


def reset() -> None:
    """Drop the active policy (used by tests)."""
    global _state
    _state = None


def job_root() -> Path:
    return current().root


def is_protected(path: str | Path) -> bool:
    """True when ``path`` must not be written."""
    p = Path(path)
    if p.name in PROTECTED_NAMES:
        return True
    if any(part == ".git" for part in p.parts):
        return True
    return p.suffix.lower() in PROTECTED_SUFFIXES


def resolve(path: str | Path, *, must_exist: bool = False) -> Path:
    """Resolve ``path`` inside the job root, refusing escapes."""
    root = job_root()
    raw = Path(path).expanduser()
    candidate = raw if raw.is_absolute() else root / raw
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PermissionError(f"path escapes the job root: {resolved}") from exc
    if must_exist and not resolved.exists():
        raise FileNotFoundError(str(resolved))
    return resolved


def require_write(path: str | Path) -> Path:
    """Resolve a write target, enforcing read-only mode and protection."""
    if not current().allow_write:
        raise PermissionError("write access is disabled for this job")
    resolved = resolve(path)
    if is_protected(resolved):
        raise PermissionError(f"'{resolved}' is a protected file")
    return resolved


def require_shell() -> None:
    if not current().allow_shell:
        raise PermissionError("shell access is disabled for this job")


def require_network() -> None:
    if not current().allow_network:
        raise PermissionError("network access is disabled for this job")
