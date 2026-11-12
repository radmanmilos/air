"""The AIR job contract, read from the canonical schema in the AIR repo.

There is exactly one contract file: ``contracts/job.schema.json`` at the AIR
root. This module reads it (never a copy) and validates payloads with a small,
deliberately limited JSON Schema subset. Keeping the subset small means the
validator has no third-party dependencies and behaves identically to the
TypeScript one in ``src/contracts/job.ts``.

If the schema grows a keyword this validator does not implement, the contract
tests fail instead of silently skipping the check.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CONTRACT_VERSION = 1

# Exit codes are part of the contract: AIR maps them to error categories.
EXIT_CODES = {
    "COMPLETED": 0,
    "INVALID_REQUEST": 2,
    "WORKER_FAILED": 3,
    "CANCELLED": 4,
    "PROVIDER_UNAVAILABLE": 5,
}

SUPPORTED_KEYWORDS = frozenset(
    {
        "$schema",
        "$id",
        "title",
        "description",
        "$defs",
        "$ref",
        "oneOf",
        "type",
        "properties",
        "required",
        "additionalProperties",
        "enum",
        "minimum",
        "maximum",
        "items",
        "x-contractVersion",
        "x-exitCodes",
    }
)


def schema_path() -> Path:
    """Locate the canonical contract file.

    ``AIR_CONTRACT_PATH`` wins; otherwise walk up from this file until a
    ``contracts/job.schema.json`` is found (works in the monorepo and in the
    npm-installed layout ``node_modules/air/packages/local-worker``).
    """
    override = os.environ.get("AIR_CONTRACT_PATH")
    if override:
        return Path(override).expanduser().resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "contracts" / "job.schema.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "contracts/job.schema.json not found; set AIR_CONTRACT_PATH to the AIR contract file"
    )


def load_schema(path: str | Path | None = None) -> dict[str, Any]:
    target = Path(path) if path is not None else schema_path()
    with open(target, encoding="utf-8") as f:
        return json.load(f)


def _type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return False


def _resolve_ref(ref: str, root: dict[str, Any]) -> dict[str, Any]:
    prefix = "#/$defs/"
    if not ref.startswith(prefix):
        raise ValueError(f"unsupported $ref (only #/$defs/* is supported): {ref}")
    name = ref[len(prefix) :]
    defs = root.get("$defs") or {}
    if name not in defs:
        raise ValueError(f"$ref points at unknown definition: {name}")
    return defs[name]


def _validate(
    value: Any,
    schema: dict[str, Any],
    root: dict[str, Any],
    path: str,
    errors: list[str],
) -> None:
    if "$ref" in schema:
        _validate(value, _resolve_ref(schema["$ref"], root), root, path, errors)
        return

    if "oneOf" in schema:
        branches = schema["oneOf"]
        passing = 0
        for branch in branches:
            branch_errors: list[str] = []
            _validate(value, branch, root, path, branch_errors)
            if not branch_errors:
                passing += 1
        if passing != 1:
            errors.append(f"{path}: must match exactly one variant (matched {passing})")
        return

    expected_type = schema.get("type")
    if expected_type is not None:
        types = expected_type if isinstance(expected_type, list) else [expected_type]
        if not any(_type_ok(value, t) for t in types):
            errors.append(f"{path}: expected {'/'.join(types)}, got {type(value).__name__}")
            return

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {schema['enum']}, got {value!r}")

    if "minimum" in schema and isinstance(value, (int, float)) and not isinstance(value, bool):
        if value < schema["minimum"]:
            errors.append(f"{path}: must be >= {schema['minimum']}")
    if "maximum" in schema and isinstance(value, (int, float)) and not isinstance(value, bool):
        if value > schema["maximum"]:
            errors.append(f"{path}: must be <= {schema['maximum']}")

    if isinstance(value, dict):
        properties = schema.get("properties") or {}
        for key in schema.get("required") or []:
            if key not in value:
                errors.append(f"{path}: missing required field '{key}'")
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{path}: unexpected field '{key}'")
        for key, subschema in properties.items():
            if key in value:
                _validate(value[key], subschema, root, f"{path}.{key}", errors)

    if isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            _validate(item, schema["items"], root, f"{path}[{index}]", errors)


def validate(value: Any, definition: str, schema: dict[str, Any] | None = None) -> list[str]:
    """Validate ``value`` against ``#/$defs/<definition>``. Returns error strings."""
    root = schema if schema is not None else load_schema()
    defs = root.get("$defs") or {}
    if definition not in defs:
        raise ValueError(f"unknown contract definition: {definition}")
    errors: list[str] = []
    _validate(value, defs[definition], root, "$", errors)
    return errors


def validate_request(value: Any, schema: dict[str, Any] | None = None) -> list[str]:
    return validate(value, "request", schema)


def validate_result(value: Any, schema: dict[str, Any] | None = None) -> list[str]:
    return validate(value, "result", schema)


def unsupported_keywords(schema: dict[str, Any] | None = None) -> list[str]:
    """Return schema keywords this validator does not implement.

    Walks schema nodes only, never property maps, so field names are not
    mistaken for keywords. A new keyword in the contract fails this check.
    """
    root = schema if schema is not None else load_schema()
    unknown: set[str] = set()

    def walk(node: dict[str, Any]) -> None:
        for key in node:
            if key not in SUPPORTED_KEYWORDS:
                unknown.add(key)
        for sub in (node.get("properties") or {}).values():
            walk(sub)
        if isinstance(node.get("items"), dict):
            walk(node["items"])
        for sub in (node.get("$defs") or {}).values():
            walk(sub)
        for sub in node.get("oneOf") or []:
            walk(sub)

    walk(root)
    return sorted(unknown)

