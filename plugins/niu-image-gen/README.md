# Niu Image Gen

Generate, edit, and batch-process images through the third-party API configured
in `scripts/generate.mjs`.

This directory is a maintained derivative of the `niu-image-gen` plugin from
`borawong/AiMaMi`. See `NOTICE.md` and `LICENSE` for source and licensing
details.

## Credentials

The plugin supports two credential sources:

1. Set the `NIU_IMAGE_GEN_API_KEY` environment variable.
2. Run `node scripts/generate.mjs --set-key <key>` to store the key in
   `~/.codex/niu-image-gen-config.json`.

The configuration-file method stores the API key in plaintext. File permissions
are restricted to the current user on operating systems that support POSIX
permission bits.

Image generation and editing send the API key, prompt, and any source image to
the third-party service configured by the plugin:

```text
https://api.iiiiitoken.com/v1/images/generations
```

Review that service's terms and privacy practices before using the plugin.

## Development checks

Run from the repository root:

```powershell
node --check plugins/niu-image-gen/scripts/generate.mjs
python scripts/validate_repository.py
```
