# Niu Image Gen Attribution Notice

This plugin is derived from the `niu-image-gen` plugin in:

- Project: `borawong/AiMaMi`
- Source: https://github.com/borawong/AiMaMi
- Imported commit: `297c7af56f10fb371b77bc9b6b65aa320afcbe7e`
- Original copyright: Copyright 2025-2026 borawong
- License: Apache License 2.0

The full upstream license is included in `LICENSE`.

## Big-Molecule modifications

Modified on 2026-07-23:

- Added repository, license, maintenance, and marketplace metadata.
- Replaced the fixed `$HOME/plugins/...` script assumption with installed-path resolution.
- Added `NIU_IMAGE_GEN_API_KEY` support.
- Added configurable protocol, host, port, request path, API key, and model.
- Added environment-variable overrides for every API connection field.
- Added backward-compatible migration from the legacy top-level `apiKey`.
- Restricted the local configuration file to owner access where the operating system supports it.
- Clarified that locally stored API credentials are sent to the configured third-party API during requests.

The bundled `assets/logo.png` and `skills/niu-image-gen/agents/openai.yaml`
are copied unchanged from the imported upstream commit.
