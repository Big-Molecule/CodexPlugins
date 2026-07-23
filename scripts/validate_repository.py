#!/usr/bin/env python3
"""Validate the marketplace and every Codex plugin in this repository."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
PLUGINS_ROOT = REPO_ROOT / "plugins"
MARKETPLACE_PATH = REPO_ROOT / ".agents" / "plugins" / "marketplace.json"
SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
PLUGIN_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VALID_INSTALL_POLICIES = {
    "NOT_AVAILABLE",
    "AVAILABLE",
    "INSTALLED_BY_DEFAULT",
}
VALID_AUTH_POLICIES = {"ON_INSTALL", "ON_USE"}
ALLOWED_MANIFEST_FIELDS = {
    "id",
    "name",
    "version",
    "description",
    "skills",
    "hooks",
    "apps",
    "mcpServers",
    "interface",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
}
REQUIRED_INTERFACE_FIELDS = {
    "displayName",
    "shortDescription",
    "longDescription",
    "developerName",
    "category",
    "capabilities",
}


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def require_string(
        self,
        payload: dict[str, Any],
        key: str,
        location: str,
    ) -> str | None:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            self.error(f"{location}.{key} must be a non-empty string")
            return None
        return value


def load_json(path: Path, validation: Validation) -> dict[str, Any] | None:
    if not path.is_file():
        validation.error(f"missing file: {path.relative_to(REPO_ROOT)}")
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        validation.error(f"invalid JSON in {path.relative_to(REPO_ROOT)}: {exc}")
        return None
    if not isinstance(payload, dict):
        validation.error(f"{path.relative_to(REPO_ROOT)} must contain a JSON object")
        return None
    return payload


def is_safe_relative_path(raw_path: str) -> bool:
    path = PurePosixPath(raw_path)
    return (
        raw_path.startswith("./")
        and not path.is_absolute()
        and ".." not in path.parts
    )


def validate_https_url(
    value: Any,
    location: str,
    validation: Validation,
) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        validation.error(f"{location} must be an HTTPS URL")
        return
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        validation.error(f"{location} must be an absolute HTTPS URL")


def validate_skill(skill_root: Path, validation: Validation) -> None:
    skill_path = skill_root / "SKILL.md"
    relative = skill_root.relative_to(REPO_ROOT)
    if not skill_path.is_file():
        validation.error(f"{relative} is missing SKILL.md")
        return
    contents = skill_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", contents, flags=re.DOTALL)
    if match is None:
        validation.error(f"{relative}/SKILL.md must start with YAML frontmatter")
        return

    frontmatter = match.group(1)
    name_match = re.search(r"^name:\s*['\"]?([^'\"\n]+)", frontmatter, re.MULTILINE)
    description_match = re.search(
        r"^description:\s*(.+)$",
        frontmatter,
        re.MULTILINE,
    )
    if name_match is None or not name_match.group(1).strip():
        validation.error(f"{relative}/SKILL.md frontmatter needs a name")
    elif name_match.group(1).strip() != skill_root.name:
        validation.error(
            f"{relative}/SKILL.md name must match its folder: {skill_root.name}"
        )
    if description_match is None or not description_match.group(1).strip():
        validation.error(f"{relative}/SKILL.md frontmatter needs a description")


def validate_manifest(
    plugin_root: Path,
    expected_name: str,
    validation: Validation,
) -> None:
    manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    manifest = load_json(manifest_path, validation)
    if manifest is None:
        return
    location = str(manifest_path.relative_to(REPO_ROOT)).replace("\\", "/")

    unknown_fields = sorted(set(manifest) - ALLOWED_MANIFEST_FIELDS)
    if unknown_fields:
        validation.error(
            f"{location} has unsupported fields: {', '.join(unknown_fields)}"
        )

    name = validation.require_string(manifest, "name", location)
    if name is not None and name != expected_name:
        validation.error(
            f"{location}.name must match plugin directory: {expected_name}"
        )

    version = validation.require_string(manifest, "version", location)
    if version is not None and SEMVER_RE.fullmatch(version) is None:
        validation.error(f"{location}.version must use semantic versioning")
    validation.require_string(manifest, "description", location)

    author = manifest.get("author")
    if not isinstance(author, dict):
        validation.error(f"{location}.author must be an object")
    else:
        validation.require_string(author, "name", f"{location}.author")
        validate_https_url(author.get("url"), f"{location}.author.url", validation)

    for field in ("homepage", "repository"):
        validate_https_url(manifest.get(field), f"{location}.{field}", validation)

    interface = manifest.get("interface")
    if not isinstance(interface, dict):
        validation.error(f"{location}.interface must be an object")
    else:
        for field in sorted(REQUIRED_INTERFACE_FIELDS - {"capabilities"}):
            validation.require_string(interface, field, f"{location}.interface")
        capabilities = interface.get("capabilities")
        if not isinstance(capabilities, list) or not all(
            isinstance(item, str) and item.strip() for item in capabilities
        ):
            validation.error(
                f"{location}.interface.capabilities must be an array of strings"
            )
        default_prompt = interface.get(
            "defaultPrompt",
            interface.get("default_prompt"),
        )
        if isinstance(default_prompt, str):
            if not default_prompt.strip():
                validation.error(
                    f"{location}.interface.defaultPrompt must not be empty"
                )
        elif isinstance(default_prompt, list):
            if not 1 <= len(default_prompt) <= 3 or not all(
                isinstance(item, str) and item.strip() and len(item) <= 128
                for item in default_prompt
            ):
                validation.error(
                    f"{location}.interface.defaultPrompt must contain 1-3 "
                    "non-empty strings of at most 128 characters"
                )
        else:
            validation.error(
                f"{location}.interface.defaultPrompt is required"
            )
        for field in ("websiteURL", "privacyPolicyURL", "termsOfServiceURL"):
            validate_https_url(
                interface.get(field),
                f"{location}.interface.{field}",
                validation,
            )

    component_paths = {
        "skills": "skills",
        "apps": ".app.json",
        "mcpServers": ".mcp.json",
    }
    for field, default_path in component_paths.items():
        raw_path = manifest.get(field)
        if raw_path is None:
            continue
        if not isinstance(raw_path, str) or not is_safe_relative_path(raw_path):
            validation.error(f"{location}.{field} must be a safe ./ relative path")
            continue
        resolved = plugin_root / raw_path[2:]
        if not resolved.exists():
            validation.error(f"{location}.{field} points to missing {default_path}")

    hooks = manifest.get("hooks")
    if hooks is not None:
        validate_hooks_reference(
            hooks,
            plugin_root,
            f"{location}.hooks",
            validation,
        )

    default_hooks_path = plugin_root / "hooks" / "hooks.json"
    if default_hooks_path.exists():
        load_json(default_hooks_path, validation)

    skills_root = plugin_root / "skills"
    if skills_root.is_dir():
        for skill_root in sorted(skills_root.iterdir()):
            if skill_root.is_dir() and not skill_root.name.startswith("."):
                validate_skill(skill_root, validation)


def validate_hooks_reference(
    value: Any,
    plugin_root: Path,
    location: str,
    validation: Validation,
) -> None:
    if isinstance(value, str):
        if not is_safe_relative_path(value):
            validation.error(f"{location} must be a safe ./ relative path")
            return
        if not (plugin_root / value[2:]).exists():
            validation.error(f"{location} points to a missing file")
        return
    if isinstance(value, dict):
        return
    if isinstance(value, list) and value:
        for index, item in enumerate(value):
            validate_hooks_reference(
                item,
                plugin_root,
                f"{location}[{index}]",
                validation,
            )
        return
    validation.error(
        f"{location} must be a path, hooks object, or non-empty array of either"
    )


def validate_marketplace(validation: Validation) -> None:
    marketplace = load_json(MARKETPLACE_PATH, validation)
    if marketplace is None:
        return
    location = str(MARKETPLACE_PATH.relative_to(REPO_ROOT)).replace("\\", "/")
    validation.require_string(marketplace, "name", location)

    interface = marketplace.get("interface")
    if not isinstance(interface, dict):
        validation.error(f"{location}.interface must be an object")
    else:
        validation.require_string(interface, "displayName", f"{location}.interface")

    entries = marketplace.get("plugins")
    if not isinstance(entries, list):
        validation.error(f"{location}.plugins must be an array")
        return

    names: set[str] = set()
    registered_directories: set[str] = set()
    for index, entry in enumerate(entries):
        entry_location = f"{location}.plugins[{index}]"
        if not isinstance(entry, dict):
            validation.error(f"{entry_location} must be an object")
            continue
        name = validation.require_string(entry, "name", entry_location)
        if name is None:
            continue
        if PLUGIN_NAME_RE.fullmatch(name) is None or len(name) > 64:
            validation.error(f"{entry_location}.name must be kebab-case and <= 64 chars")
        if name in names:
            validation.error(f"duplicate marketplace plugin: {name}")
        names.add(name)

        source = entry.get("source")
        expected_path = f"./plugins/{name}"
        if not isinstance(source, dict):
            validation.error(f"{entry_location}.source must be an object")
        else:
            if source.get("source") != "local":
                validation.error(f"{entry_location}.source.source must be local")
            if source.get("path") != expected_path:
                validation.error(
                    f"{entry_location}.source.path must be {expected_path}"
                )

        policy = entry.get("policy")
        if not isinstance(policy, dict):
            validation.error(f"{entry_location}.policy must be an object")
        else:
            if policy.get("installation") not in VALID_INSTALL_POLICIES:
                validation.error(
                    f"{entry_location}.policy.installation is invalid"
                )
            if policy.get("authentication") not in VALID_AUTH_POLICIES:
                validation.error(
                    f"{entry_location}.policy.authentication is invalid"
                )
        validation.require_string(entry, "category", entry_location)

        plugin_root = PLUGINS_ROOT / name
        registered_directories.add(name)
        if not plugin_root.is_dir():
            validation.error(f"marketplace plugin directory is missing: plugins/{name}")
        else:
            validate_manifest(plugin_root, name, validation)

    disk_directories = {
        path.name
        for path in PLUGINS_ROOT.iterdir()
        if path.is_dir() and not path.name.startswith(".")
    }
    unregistered = sorted(disk_directories - registered_directories)
    if unregistered:
        validation.error(
            "plugin directories missing from marketplace.json: "
            + ", ".join(unregistered)
        )


def main() -> None:
    validation = Validation()
    if not PLUGINS_ROOT.is_dir():
        validation.error("missing plugins directory")
    validate_marketplace(validation)

    if validation.errors:
        print("Repository validation failed:")
        for error in validation.errors:
            print(f"- {error}")
        raise SystemExit(1)

    marketplace = json.loads(MARKETPLACE_PATH.read_text(encoding="utf-8"))
    print(
        "Repository validation passed: "
        f"{len(marketplace['plugins'])} plugin(s) registered."
    )


if __name__ == "__main__":
    main()
