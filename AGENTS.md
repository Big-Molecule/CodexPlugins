# Repository Guidance

This repository is a public Codex plugin marketplace.

## Structure

- Keep the marketplace manifest at `.agents/plugins/marketplace.json`.
- Put each plugin in `plugins/<plugin-name>/`.
- Match the plugin folder, marketplace entry name, and
  `.codex-plugin/plugin.json` name exactly.
- Use lower-case kebab-case names with at most 64 characters.
- Keep marketplace source paths in the form `./plugins/<plugin-name>`.

## Plugin Requirements

- Every plugin must contain `.codex-plugin/plugin.json`.
- Use strict semantic versions.
- Include real author and interface metadata; do not leave placeholder values.
- Add `apps`, `mcpServers`, or explicit hook paths only when the referenced files exist.
- Prefer the default `hooks/hooks.json` location when a plugin has lifecycle hooks.
- Keep each skill in `skills/<skill-name>/SKILL.md`.
- Never commit credentials, local tokens, private endpoints, or generated caches.

## Workflow

1. Create a plugin with `python scripts/new_plugin.py`.
2. Replace the generated starter skill with the real workflow.
3. Add focused tests or verification scripts when the plugin contains executable code.
4. Run `python scripts/validate_repository.py`.
5. Keep unrelated repository changes out of the same commit.
