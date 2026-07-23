# Niu Image Gen

Generate, edit, and batch-process images through a configurable
OpenAI-compatible image API.

This directory is a maintained derivative of the `niu-image-gen` plugin from
`borawong/AiMaMi`. See `NOTICE.md` and `LICENSE` for source and licensing
details.

## API configuration

Configuration is stored in `~/.codex/niu-image-gen-config.json`:

```json
{
  "api": {
    "protocol": "https",
    "host": "api.example.com",
    "port": 443,
    "path": "/v1/images/generations",
    "key": "your-api-key",
    "model": "your-image-model"
  },
  "quickMode": {
    "quality": "2K",
    "ratio": "square",
    "count": 1
  }
}
```

`host` may be a domain, IPv4 address, bracketed IPv6 address, or `localhost`.
Do not include the scheme, port, or path in `host`. Set `port` to `null` or
omit it to use the protocol's default port.

Save the endpoint and key from the command line:

```powershell
node scripts/generate.mjs --set-api `
  --protocol https `
  --host api.example.com `
  --port 443 `
  --path /v1/images/generations `
  --model your-image-model `
  --key your-api-key
```

Existing configurations with a top-level `apiKey` remain readable. The next
`--set-key` or `--set-api` command migrates that value to `api.key`.

## Environment overrides

Every API field can be overridden without editing the configuration file:

| Environment variable | Field |
|---|---|
| `NIU_IMAGE_GEN_API_PROTOCOL` | `api.protocol` |
| `NIU_IMAGE_GEN_API_HOST` | `api.host` |
| `NIU_IMAGE_GEN_API_PORT` | `api.port` |
| `NIU_IMAGE_GEN_API_PATH` | `api.path` |
| `NIU_IMAGE_GEN_API_KEY` | `api.key` |
| `NIU_IMAGE_GEN_API_MODEL` | `api.model` |

The plugin supports two common credential workflows:

1. Set the `NIU_IMAGE_GEN_API_KEY` environment variable.
2. Run `node scripts/generate.mjs --set-key <key>` to store the key in
   `~/.codex/niu-image-gen-config.json`.

The configuration-file method stores the API key in plaintext. File permissions
are restricted to the current user on operating systems that support POSIX
permission bits.

## API compatibility

The configured endpoint must accept a JSON request containing `model`, `prompt`,
`n`, and `size`. Image-editing requests also include an `image` data URL. The
response must provide base64 image data in `data[].b64_json`.

Image generation and editing send the configured API key, prompt, and any source
image to the selected service. Review that service's terms and privacy practices
before using it.

## Development checks

Run from the repository root:

```powershell
node --check plugins/niu-image-gen/scripts/generate.mjs
node --test plugins/niu-image-gen/tests/generate.test.mjs
python scripts/validate_repository.py
```
