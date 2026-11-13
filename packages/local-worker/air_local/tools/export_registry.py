"""Export the authoritative built-in worker tool registry as normalized JSON.

Used by the TypeScript evaluation parity check to compare the Python worker
tool definitions against the evaluation tool registry without a manually
maintained snapshot. Output is deterministic (sorted keys, registration order).
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path
from typing import Any

# Allow running as a script/module from the package root.
_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))


def _install_import_stubs() -> None:
    """Provide minimal stubs for optional/runtime-only deps during schema export.

    ``build_registry()`` wires implementation callables but schema parity only
    needs tool names/descriptions/parameter schemas from ``Registry.schemas()``.
    Some implementation modules import HTTP/config libraries at module import
    time (e.g. ``requests``, ``yaml``); CI Node test jobs do not install Python
    worker deps, so we stub only missing modules to allow deterministic schema
    export without changing runtime tool behavior.
    """
    if "requests" not in sys.modules:
        requests_stub = types.ModuleType("requests")

        class _RequestException(Exception):
            pass

        class _ConnectionError(_RequestException):
            pass

        class _Timeout(_RequestException):
            pass

        requests_stub.RequestException = _RequestException
        requests_stub.ConnectionError = _ConnectionError
        requests_stub.Timeout = _Timeout
        requests_stub.get = lambda *args, **kwargs: None
        requests_stub.post = lambda *args, **kwargs: None
        sys.modules["requests"] = requests_stub

    if "yaml" not in sys.modules:
        yaml_stub = types.ModuleType("yaml")

        def _safe_load(*_args: Any, **_kwargs: Any) -> Any:
            return {}

        def _safe_dump(*_args: Any, **_kwargs: Any) -> str:
            return ""

        yaml_stub.safe_load = _safe_load
        yaml_stub.safe_dump = _safe_dump
        sys.modules["yaml"] = yaml_stub


def _load_build_registry():  # type: ignore[no-untyped-def]
    _install_import_stubs()
    from air_local.tools.builtin import build_registry  # noqa: E402

    return build_registry



def normalize_schema(value: Any) -> Any:
    """Recursively normalize a JSON-schema-like value for parity comparison.

    Normalization preserves semantically relevant fields and sorts object keys
    for deterministic comparison. Required/property-name collections are sorted
    where order is not semantically meaningful.
    """
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key in sorted(value.keys()):
            v = value[key]
            if key == "required" and isinstance(v, list):
                normalized[key] = sorted(str(x) for x in v)
            elif key == "enum" and isinstance(v, list):
                normalized[key] = [normalize_schema(x) for x in v]
            elif key == "properties" and isinstance(v, dict):
                normalized[key] = {name: normalize_schema(v[name]) for name in sorted(v.keys())}
            else:
                normalized[key] = normalize_schema(v)
        return normalized
    if isinstance(value, list):
        return [normalize_schema(x) for x in value]
    return value


def export_registry() -> list[dict[str, Any]]:
    build_registry = _load_build_registry()
    registry = build_registry()
    tools: list[dict[str, Any]] = []
    for schema in registry.schemas():
        fn = schema.get("function", {})
        tools.append(
            normalize_schema(
                {
                    "name": fn.get("name"),
                    "description": fn.get("description"),
                    "parameters": fn.get("parameters"),
                }
            )
        )
    return tools


def main() -> int:
    json.dump(export_registry(), sys.stdout, sort_keys=True, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
