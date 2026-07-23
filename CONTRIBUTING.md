# Contributing

## Create a plugin

Run:

```powershell
python scripts/new_plugin.py my-plugin `
  --display-name "My Plugin" `
  --description "Describe exactly when and why Codex should use this plugin."
```

This creates:

```text
plugins/my-plugin/
|-- .codex-plugin/
|   `-- plugin.json
`-- skills/
    `-- my-plugin/
        `-- SKILL.md
```

It also appends the plugin to `.agents/plugins/marketplace.json`.

## Before opening a pull request

1. Replace the generated skill body with the real workflow.
2. Confirm that metadata describes the implemented behavior.
3. Bump the plugin version when changing a published plugin.
4. Add tests for scripts, MCP servers, apps, or other executable behavior.
5. Run:

```powershell
python scripts/validate_repository.py
```

The same validation runs in GitHub Actions.

## Marketplace rules

- Append new plugins unless an intentional ordering change is required.
- Keep `policy.installation` and `policy.authentication` explicit.
- Default public plugins to `AVAILABLE` and `ON_INSTALL`.
- Do not add product gating unless it is required and documented.
- Preserve upstream copyright, license, and attribution notices when importing code.
- Do not publish secrets or machine-specific absolute paths.
