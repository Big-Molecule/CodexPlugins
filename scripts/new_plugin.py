#!/usr/bin/env python3
"""Create a Codex plugin and register it in this repository marketplace."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PLUGINS_ROOT = REPO_ROOT / "plugins"
MARKETPLACE_PATH = REPO_ROOT / ".agents" / "plugins" / "marketplace.json"
MAX_NAME_LENGTH = 64
VALID_INSTALL_POLICIES = {
    "NOT_AVAILABLE",
    "AVAILABLE",
    "INSTALLED_BY_DEFAULT",
}
VALID_AUTH_POLICIES = {"ON_INSTALL", "ON_USE"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a validation-ready Codex plugin in this marketplace."
    )
    parser.add_argument("name", help="Plugin name; normalized to lower-case kebab-case")
    parser.add_argument(
        "--description",
        required=True,
        help="Short description used by both the plugin and its initial skill",
    )
    parser.add_argument("--display-name", help="User-facing plugin name")
    parser.add_argument("--author", default="Big-Molecule")
    parser.add_argument("--category", default="Productivity")
    parser.add_argument("--version", default="0.1.0")
    parser.add_argument(
        "--capability",
        action="append",
        default=[],
        help="Repeat to add multiple capabilities",
    )
    parser.add_argument(
        "--install-policy",
        choices=sorted(VALID_INSTALL_POLICIES),
        default="AVAILABLE",
    )
    parser.add_argument(
        "--auth-policy",
        choices=sorted(VALID_AUTH_POLICIES),
        default="ON_INSTALL",
    )
    return parser.parse_args()


def normalize_name(raw_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", raw_name.strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    if not normalized:
        raise ValueError("Plugin name must contain at least one letter or digit.")
    if len(normalized) > MAX_NAME_LENGTH:
        raise ValueError(
            f"Normalized plugin name exceeds {MAX_NAME_LENGTH} characters: {normalized}"
        )
    return normalized


def default_display_name(plugin_name: str) -> str:
    return " ".join(part.capitalize() for part in plugin_name.split("-"))


def shorten(value: str, limit: int = 120) -> str:
    value = " ".join(value.split())
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def load_marketplace() -> dict[str, Any]:
    try:
        payload = json.loads(MARKETPLACE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Missing marketplace file: {MARKETPLACE_PATH}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {MARKETPLACE_PATH}: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("plugins"), list):
        raise ValueError("marketplace.json must contain a root object and a plugins array.")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_manifest(
    plugin_name: str,
    display_name: str,
    description: str,
    author: str,
    category: str,
    version: str,
    capabilities: list[str],
) -> dict[str, Any]:
    return {
        "name": plugin_name,
        "version": version,
        "description": description,
        "author": {
            "name": author,
            "url": "https://github.com/Big-Molecule",
        },
        "repository": "https://github.com/Big-Molecule/CodexPlugins",
        "license": "MIT",
        "keywords": ["codex", "plugin", plugin_name],
        "skills": "./skills/",
        "interface": {
            "displayName": display_name,
            "shortDescription": shorten(description),
            "longDescription": description,
            "developerName": author,
            "category": category,
            "capabilities": capabilities,
            "defaultPrompt": [f"Use {display_name} to help with this task."],
        },
    }


def build_skill(plugin_name: str, display_name: str, description: str) -> str:
    yaml_description = json.dumps(description, ensure_ascii=False)
    return f"""---
name: {plugin_name}
description: {yaml_description}
---

# {display_name}

Use this skill when the user's request matches the plugin description.

## Workflow

1. Inspect the relevant workspace context before acting.
2. Follow the user's requested outcome and the repository's existing conventions.
3. Verify the result with the narrowest meaningful checks.
4. Report completed work, verification, and any remaining limitations.
"""


def main() -> None:
    args = parse_args()
    plugin_name = normalize_name(args.name)
    display_name = args.display_name or default_display_name(plugin_name)
    description = " ".join(args.description.split())
    if not description:
        raise ValueError("Description must not be empty.")

    plugin_root = PLUGINS_ROOT / plugin_name
    if plugin_root.exists():
        raise FileExistsError(f"Plugin already exists: {plugin_root}")

    marketplace = load_marketplace()
    if any(
        isinstance(entry, dict) and entry.get("name") == plugin_name
        for entry in marketplace["plugins"]
    ):
        raise FileExistsError(
            f"Marketplace entry already exists for plugin: {plugin_name}"
        )

    manifest = build_manifest(
        plugin_name=plugin_name,
        display_name=display_name,
        description=description,
        author=args.author,
        category=args.category,
        version=args.version,
        capabilities=args.capability,
    )
    marketplace_entry = {
        "name": plugin_name,
        "source": {
            "source": "local",
            "path": f"./plugins/{plugin_name}",
        },
        "policy": {
            "installation": args.install_policy,
            "authentication": args.auth_policy,
        },
        "category": args.category,
    }

    write_json(plugin_root / ".codex-plugin" / "plugin.json", manifest)
    skill_path = plugin_root / "skills" / plugin_name / "SKILL.md"
    skill_path.parent.mkdir(parents=True, exist_ok=True)
    skill_path.write_text(
        build_skill(plugin_name, display_name, description),
        encoding="utf-8",
    )

    marketplace["plugins"].append(marketplace_entry)
    write_json(MARKETPLACE_PATH, marketplace)

    print(f"Created plugin: {plugin_root}")
    print(f"Registered marketplace entry: {plugin_name}")
    print("Next: edit the generated SKILL.md, then run validate_repository.py.")


if __name__ == "__main__":
    main()
