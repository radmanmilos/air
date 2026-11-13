"""Export the authoritative built-in worker tool registry as normalized JSON.

Used by the TypeScript evaluation parity check to compare the Python worker
tool definitions against the evaluation tool registry without a manually
maintained snapshot. Output is deterministic (sorted keys, registration order).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Allow running as a script from the package root.
_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from air_local.tools.builtin import build_registry  # noqa: E402


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
