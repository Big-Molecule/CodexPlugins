#!/usr/bin/env node

// Derived from borawong/AiMaMi at commit 297c7af (Apache-2.0).
// Modified by Big-Molecule on 2026-07-23: configurable API endpoint, model, and credentials.

import { chmodSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".codex", "niu-image-gen-config.json");
const DEFAULT_API = Object.freeze({
  protocol: "https",
  host: "api.iiiiitoken.com",
  port: null,
  path: "/v1/images/generations",
  modelsPath: "/v1/models",
  model: "gpt-image-2-x",
});
const API_ENV = Object.freeze({
  protocol: "NIU_IMAGE_GEN_API_PROTOCOL",
  host: "NIU_IMAGE_GEN_API_HOST",
  port: "NIU_IMAGE_GEN_API_PORT",
  path: "NIU_IMAGE_GEN_API_PATH",
  modelsPath: "NIU_IMAGE_GEN_API_MODELS_PATH",
  key: "NIU_IMAGE_GEN_API_KEY",
  model: "NIU_IMAGE_GEN_API_MODEL",
});
const IMAGE_MODEL_HINT =
  /(image|dall[-_ ]?e|flux|sdxl|stable[-_ ]?diffusion|imagen|seedream|kolors|qwen[-_ ]?image|wan[-_ ]?image)/i;

const SIZE_MATRIX = {
  "1K": { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" },
  "2K": { square: "2048x2048", landscape: "2048x1536", portrait: "1536x2048" },
  "4K": { square: "2880x2880", landscape: "3840x2160", portrait: "2160x3840" },
};

const DEFAULTS = { quality: "2K", ratio: "square", count: 1, concurrency: 3 };
const RATIO_NAMES = { square: "正方形", landscape: "横版", portrait: "竖版" };
const QUALITY_EMOJI = { "1K": "🚀", "2K": "✨", "4K": "💎" };

function resolveSize(quality, ratio) {
  return SIZE_MATRIX[quality?.toUpperCase()]?.[ratio?.toLowerCase()] || null;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); } catch { return null; }
}

function saveConfig(cfg) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { chmodSync(CONFIG_PATH, 0o600); } catch {}
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeProtocol(value) {
  const protocol = String(value || "").trim().toLowerCase().replace(/:$/, "");
  if (!["http", "https"].includes(protocol)) {
    throw new Error('API protocol must be "http" or "https".');
  }
  return protocol;
}

function normalizeHost(value) {
  const host = String(value || "").trim();
  if (!host || host.includes("://") || /[/?#@\s]/.test(host)) {
    throw new Error("API host must be a domain, IP address, or localhost without a scheme or path.");
  }
  if (host.includes(":") && !(host.startsWith("[") && host.endsWith("]"))) {
    throw new Error("Put the API port in api.port instead of api.host.");
  }
  return host;
}

function normalizePort(value) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    String(value).toLowerCase() === "default"
  ) {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API port must be an integer from 1 to 65535, or default.");
  }
  return port;
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path) {
    throw new Error("API path must not be empty.");
  }
  return `/${path.replace(/^\/+/, "")}`;
}

function normalizeModel(value) {
  const model = String(value || "").trim();
  if (!model) {
    throw new Error("API model must not be empty.");
  }
  return model;
}

function previewSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function resolveApiConfig(cfg = loadConfig(), { useEnv = true } = {}) {
  const stored = cfg?.api && typeof cfg.api === "object" ? cfg.api : {};
  const env = useEnv ? process.env : {};
  const protocol = normalizeProtocol(
    firstDefined(env[API_ENV.protocol], stored.protocol, DEFAULT_API.protocol)
  );
  const host = normalizeHost(
    firstDefined(env[API_ENV.host], stored.host, stored.domain, DEFAULT_API.host)
  );
  const port = normalizePort(
    firstDefined(env[API_ENV.port], stored.port, DEFAULT_API.port)
  );
  const path = normalizePath(
    firstDefined(env[API_ENV.path], stored.path, DEFAULT_API.path)
  );
  const modelsPath = normalizePath(
    firstDefined(env[API_ENV.modelsPath], stored.modelsPath, DEFAULT_API.modelsPath)
  );
  const model = normalizeModel(
    firstDefined(env[API_ENV.model], stored.model, DEFAULT_API.model)
  );
  const modelSource = env[API_ENV.model]
    ? API_ENV.model
    : stored.model
      ? "config.api.model"
      : "default";
  const key = firstDefined(env[API_ENV.key], stored.key, cfg?.apiKey, null) || null;
  const keySource = env[API_ENV.key]
    ? API_ENV.key
    : stored.key
      ? "config.api.key"
      : cfg?.apiKey
        ? "legacy config.apiKey"
        : null;

  const authority = port === null ? host : `${host}:${port}`;
  const endpoint = new URL(path, `${protocol}://${authority}/`).toString();
  const modelsEndpoint = new URL(
    modelsPath,
    `${protocol}://${authority}/`
  ).toString();

  return {
    protocol,
    host,
    port,
    path,
    endpoint,
    modelsPath,
    modelsEndpoint,
    key,
    keySource,
    model,
    modelSource,
  };
}

function getApiConfig() {
  const api = resolveApiConfig();
  if (!api.key) {
    console.error(
      `ERROR: API key not configured. Set ${API_ENV.key}, use --set-key, or add api.key to ${CONFIG_PATH}.`
    );
    process.exit(1);
  }
  return api;
}

function apiForStorage(api) {
  return {
    protocol: api.protocol,
    host: api.host,
    port: api.port,
    path: api.path,
    modelsPath: api.modelsPath,
    key: api.key,
    model: api.model,
  };
}

function normalizeModelRecord(value) {
  if (typeof value === "string") {
    return { id: value };
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = value.id ?? value.name ?? value.model;
  if (typeof id !== "string" || !id.trim()) {
    return null;
  }
  return {
    id: id.trim(),
    ownedBy: value.owned_by ?? value.ownedBy ?? value.owner ?? null,
    created: value.created ?? null,
  };
}

function extractModels(payload) {
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : null;
  if (rawModels === null) {
    throw new Error(
      "Model-list response must be an array or contain a data/models array."
    );
  }

  const seen = new Set();
  const models = [];
  for (const value of rawModels) {
    const model = normalizeModelRecord(value);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push({
      ...model,
      likelyImageModel: IMAGE_MODEL_HINT.test(model.id),
    });
  }
  models.sort(
    (left, right) =>
      Number(right.likelyImageModel) - Number(left.likelyImageModel) ||
      left.id.localeCompare(right.id)
  );
  return models;
}

async function queryModels(api) {
  const headers = { Accept: "application/json" };
  if (api.key) {
    headers.Authorization = `Bearer ${api.key}`;
  }
  const response = await fetch(api.modelsEndpoint, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      message = JSON.parse(body).error?.message || body;
    } catch {}
    throw new Error(
      `Model query failed with HTTP ${response.status}: ${message}`
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Model-list endpoint did not return valid JSON.");
  }
  const models = extractModels(payload);
  return {
    modelsEndpoint: api.modelsEndpoint,
    selectedModel: api.model,
    selectedModelAvailable: models.some((model) => model.id === api.model),
    count: models.length,
    likelyImageModels: models
      .filter((model) => model.likelyImageModel)
      .map((model) => model.id),
    models,
  };
}

function timestamp() {
  const d = new Date();
  return [
    d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"), "_",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
}

function resolveOutputDir(userDir) {
  const dir = userDir || join(homedir(), "Pictures", "niu-image-gen");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function generate(api, prompt, size, outputDir) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 220_000);

  try {
    const res = await fetch(api.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.key}` },
      body: JSON.stringify({ model: api.model, prompt, n: 1, size }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      let msg;
      try { msg = JSON.parse(body).error?.message || body; } catch { msg = body; }
      return { ok: false, elapsed, error: `HTTP ${res.status}: ${msg}` };
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false, elapsed, error: "No image data in response" };

    const buf = Buffer.from(b64, "base64");
    const filename = `img_${timestamp()}_${Math.random().toString(36).slice(2, 6)}.png`;
    const filepath = join(outputDir, filename);
    writeFileSync(filepath, buf);

    return { ok: true, elapsed, path: filepath, fileSize: `${(buf.length / 1024 / 1024).toFixed(2)}MB` };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, elapsed: Date.now() - start, error: err.name === "AbortError" ? "Timeout (220s)" : err.message };
  }
}

async function editImage(api, imagePath, prompt, size, outputDir, count = 1, silent = false) {
  if (!existsSync(imagePath)) {
    return { ok: false, elapsed: 0, error: `文件不存在: ${imagePath}`, sourceName: basename(imagePath) };
  }

  const imageData = readFileSync(imagePath);
  const lp = imagePath.toLowerCase();
  const ext = lp.endsWith(".jpg") || lp.endsWith(".jpeg") ? "jpeg" : lp.endsWith(".webp") ? "webp" : "png";
  const dataUrl = `data:image/${ext};base64,${imageData.toString("base64")}`;
  const sourceName = basename(imagePath);

  if (!silent) {
    console.log(`🖼️ 加载 ${sourceName} (${(imageData.length / 1024 / 1024).toFixed(2)}MB)...`);
    console.log(count > 1 ? `✏️ 编辑中 × ${count}...\n` : `✏️ 编辑中...\n`);
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 250_000);

  try {
    const res = await fetch(api.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.key}` },
      body: JSON.stringify({ model: api.model, prompt, n: count, size, image: dataUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      let msg;
      try { msg = JSON.parse(body).error?.message || body; } catch { msg = body; }
      return { ok: false, elapsed, error: `HTTP ${res.status}: ${msg}`, sourceName };
    }

    const data = await res.json();

    if (count > 1) {
      const results = [];
      const ts = timestamp();
      for (let i = 0; i < (data.data?.length || 0); i++) {
        const b64 = data.data[i]?.b64_json;
        if (b64) {
          const buf = Buffer.from(b64, "base64");
          const filename = `edit_${ts}_${i + 1}_${Math.random().toString(36).slice(2, 6)}.png`;
          const filepath = join(outputDir, filename);
          writeFileSync(filepath, buf);
          results.push({ path: filepath, fileSize: `${(buf.length / 1024 / 1024).toFixed(2)}MB` });
        }
      }
      return { ok: results.length > 0, elapsed, results, sourceName };
    }

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false, elapsed, error: "No image data in response", sourceName };

    const buf = Buffer.from(b64, "base64");
    const filename = `edit_${timestamp()}_${Math.random().toString(36).slice(2, 6)}.png`;
    const filepath = join(outputDir, filename);
    writeFileSync(filepath, buf);

    return { ok: true, elapsed, path: filepath, fileSize: `${(buf.length / 1024 / 1024).toFixed(2)}MB`, sourceName };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, elapsed: Date.now() - start, error: err.name === "AbortError" ? "Timeout (250s)" : err.message, sourceName };
  }
}

async function runBatchEdit(api, imagePaths, prompt, size, concurrency, outputDir) {
  const total = imagePaths.length;
  console.log(`\n✏️ 批量编辑 ${total} 张\n`);

  const startAll = Date.now();
  const results = new Array(total);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < total) {
      const idx = nextIdx++;
      const imagePath = imagePaths[idx];
      console.log(`⏳ [${idx + 1}/${total}] ${basename(imagePath)}`);
      const result = await editImage(api, imagePath, prompt, size, outputDir, 1, true);
      results[idx] = result;
      if (result.ok) {
        console.log(`✅ [${idx + 1}/${total}] ${(result.elapsed / 1000).toFixed(1)}s`);
      } else {
        console.log(`❌ [${idx + 1}/${total}] ${result.error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  const totalTime = Date.now() - startAll;

  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);

  console.log();

  const NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  console.log(`✏️ "${prompt}"\n`);
  const totalMB = ok.reduce((sum, r) => sum + parseFloat(r.fileSize), 0).toFixed(2);
  console.log(`✅ ${ok.length}/${total} ｜ ${(totalTime / 1000).toFixed(1)}s ｜ 共 ${totalMB}MB`);
  ok.forEach((r, i) => console.log(`${NUM[i] || "·"} ${basename(r.path)} ← ${r.sourceName}  ${r.fileSize}`));
  fail.forEach(r => console.log(`❌ ${r.sourceName}: ${r.error}`));
  console.log(`📍 ${outputDir}`);

  return fail.length > 0 ? 1 : 0;
}

async function batchGenerate(api, prompts, size, concurrency, outputDir, isVariation = false) {
  const total = prompts.length;
  const results = new Array(total);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < total) {
      const idx = nextIdx++;
      const prompt = prompts[idx];
      if (isVariation) {
        console.log(`⏳ [${idx + 1}/${total}]`);
      } else {
        console.log(`[${idx + 1}/${total}] 生成中: "${prompt.slice(0, 30)}${prompt.length > 30 ? "..." : ""}"`);
      }
      const result = await generate(api, prompt, size, outputDir);
      results[idx] = { prompt, ...result };
      if (result.ok) {
        console.log(`✅ [${idx + 1}/${total}] ${(result.elapsed / 1000).toFixed(1)}s`);
      } else {
        console.log(`❌ [${idx + 1}/${total}] ${result.error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  return results;
}

async function runBatch(api, prompts, size, concurrency, outputDir, isVariation = false) {
  if (!isVariation) {
    console.log(`\n📦 批量 ${prompts.length} 张\n`);
  }

  const startAll = Date.now();
  const results = await batchGenerate(api, prompts, size, concurrency, outputDir, isVariation);
  const totalTime = Date.now() - startAll;

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);

  console.log();

  if (isVariation) {
    const NUM = ["①", "②", "③", "④"];
    const p = results[0].prompt;
    const totalMB = ok.reduce((sum, r) => sum + parseFloat(r.fileSize), 0).toFixed(2);
    console.log(`🎨 "${p}" × ${results.length}\n`);
    console.log(`✅ ${(totalTime / 1000).toFixed(1)}s ｜ 共 ${totalMB}MB`);
    ok.forEach((r, i) => console.log(`${NUM[i] || "·"} ${basename(r.path)}  ${r.fileSize}`));
    fail.forEach((r) => console.log(`❌ ${r.error}`));
  } else {
    for (const r of results) {
      if (r.ok) {
        console.log(`🎨 "${r.prompt}" ✅ ${(r.elapsed / 1000).toFixed(1)}s ｜ ${r.fileSize}`);
        console.log(`📁 ${r.path}`);
      } else {
        console.log(`🎨 "${r.prompt}" ❌ ${r.error}`);
      }
      console.log();
    }
    console.log(`✅ ${ok.length}/${results.length} ｜ ${(totalTime / 1000).toFixed(1)}s`);
  }
  console.log(`📍 ${outputDir}`);
  return fail.length > 0 ? 1 : 0;
}

function printUsage() {
  console.log(`Niu Image Gen — AI Image Generation Tool

CONFIG:
  --get-config                              Show current config (JSON)
  --list-models                             Query models from the configured models endpoint
  --set-model <model-id>                    Save the selected image model
  --set-key <key>                           Save API key
  --set-api [--protocol http|https] [--host HOST] [--port PORT|default]
            [--path PATH] [--models-path PATH] [--model MODEL] [--key KEY]
                                              Save API endpoint, model, and optional key
  --set-quick-mode --quality Q --ratio R --count N   Save quick mode defaults
  --set-batch-mode --quality Q --ratio R --concurrency N   Save batch mode defaults

API ENVIRONMENT OVERRIDES:
  NIU_IMAGE_GEN_API_PROTOCOL, NIU_IMAGE_GEN_API_HOST, NIU_IMAGE_GEN_API_PORT
  NIU_IMAGE_GEN_API_PATH, NIU_IMAGE_GEN_API_MODELS_PATH
  NIU_IMAGE_GEN_API_KEY, NIU_IMAGE_GEN_API_MODEL

GENERATE:
  --prompt "..."  [--quality Q] [--ratio R] [--count N] [--output-dir D]
  --batch <file.json>   [--quality Q] [--ratio R] [--concurrency N]
  --batch-inline "p1" "p2" ...   [--quality Q] [--ratio R] [--concurrency N]

EDIT:
  --edit --image <path> --prompt "..."  [--quality Q] [--ratio R] [--count N]
  --edit --image <p1> --image <p2> --prompt "..."  [--concurrency N]

Explicit flags override saved config. Without flags, saved mode config is used.

SIZE MATRIX:
  ┌─────────┬────────────┬────────────┬────────────┐
  │         │  square    │ landscape  │  portrait  │
  ├─────────┼────────────┼────────────┼────────────┤
  │   1K    │ 1024×1024  │ 1536×1024  │ 1024×1536  │
  │   2K    │ 2048×2048  │ 2048×1536  │ 1536×2048  │
  │   4K    │ 2880×2880  │ 3840×2160  │ 2160×3840  │
  └─────────┴────────────┴────────────┴────────────┘`);
}

function parseArgs(argv) {
  const args = { prompts: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if      (a === "--get-config")                  args.flags.getConfig = true;
    else if (a === "--list-models")                 args.flags.listModels = true;
    else if (a === "--set-model" && argv[i + 1])    args.flags.setModel = argv[++i];
    else if (a === "--set-key" && argv[i + 1])      args.flags.setKey = argv[++i];
    else if (a === "--set-api")                      args.flags.setApi = true;
    else if (a === "--protocol" && argv[i + 1])      args.flags.protocol = argv[++i];
    else if (a === "--host" && argv[i + 1])          args.flags.host = argv[++i];
    else if (a === "--port" && argv[i + 1])          args.flags.port = argv[++i];
    else if (a === "--path" && argv[i + 1])          args.flags.apiPath = argv[++i];
    else if (a === "--models-path" && argv[i + 1])   args.flags.modelsPath = argv[++i];
    else if (a === "--model" && argv[i + 1])         args.flags.model = argv[++i];
    else if (a === "--key" && argv[i + 1])           args.flags.apiKey = argv[++i];
    else if (a === "--set-quick-mode")               args.flags.setQuickMode = true;
    else if (a === "--set-batch-mode")                args.flags.setBatchMode = true;
    else if (a === "--prompt" && argv[i + 1])         args.prompts.push(argv[++i]);
    else if (a === "--quality" && argv[i + 1])        args.flags.quality = argv[++i];
    else if (a === "--ratio" && argv[i + 1])          args.flags.ratio = argv[++i];
    else if (a === "--count" && argv[i + 1])          args.flags.count = parseInt(argv[++i], 10);
    else if (a === "--output-dir" && argv[i + 1])     args.flags.outputDir = argv[++i];
    else if (a === "--concurrency" && argv[i + 1])    args.flags.concurrency = parseInt(argv[++i], 10);
    else if (a === "--batch" && argv[i + 1])          args.flags.batchFile = argv[++i];
    else if (a === "--batch-inline") {
      i++;
      while (i < argv.length && !argv[i].startsWith("--")) args.prompts.push(argv[i++]);
      args.flags.batchInline = true;
      continue;
    }
    else if (a === "--edit")                             args.flags.edit = true;
    else if (a === "--image" && argv[i + 1]) { if (!args.flags.images) args.flags.images = []; args.flags.images.push(argv[++i]); }
    else if (a === "--help" || a === "-h")              args.flags.help = true;
    i++;
  }
  return args;
}

async function main() {
  const { prompts, flags } = parseArgs(process.argv.slice(2));

  // ── Config commands (no API key needed) ──

  if (flags.getConfig) {
    const cfg = loadConfig();
    const api = resolveApiConfig(cfg);
    console.log(JSON.stringify({
      api: {
        protocol: api.protocol,
        host: api.host,
        port: api.port,
        path: api.path,
        endpoint: api.endpoint,
        modelsPath: api.modelsPath,
        modelsEndpoint: api.modelsEndpoint,
        model: api.model,
        modelSource: api.modelSource,
      },
      hasKey: !!api.key,
      keySource: api.keySource,
      keyPreview: previewSecret(api.key),
      quickMode: cfg?.quickMode || null,
      batchMode: cfg?.batchMode || null,
    }, null, 2));
    process.exit(0);
  }

  if (flags.listModels) {
    const api = resolveApiConfig();
    const result = await queryModels(api);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (flags.setModel) {
    const cfg = loadConfig() || {};
    const current = resolveApiConfig(cfg, { useEnv: false });
    cfg.api = apiForStorage({
      ...current,
      model: normalizeModel(flags.setModel),
    });
    delete cfg.apiKey;
    saveConfig(cfg);
    console.log([
      "✅ 图片模型已更新！",
      "",
      `🧠 Model: ${cfg.api.model}`,
      `🌐 Endpoint: ${current.endpoint}`,
      `📁 Config: ${CONFIG_PATH}`,
      ...(process.env[API_ENV.model]
        ? [`⚠️ 当前环境变量 ${API_ENV.model} 仍会覆盖配置文件中的模型`]
        : []),
    ].join("\n"));
    process.exit(0);
  }

  if (flags.setApi) {
    const hasApiOption = [
      flags.protocol,
      flags.host,
      flags.port,
      flags.apiPath,
      flags.modelsPath,
      flags.model,
      flags.apiKey,
    ].some((value) => value !== undefined);
    if (!hasApiOption) {
      console.error("ERROR: --set-api requires at least one API option.");
      process.exit(1);
    }

    const cfg = loadConfig() || {};
    const current = resolveApiConfig(cfg, { useEnv: false });
    cfg.api = {
      protocol: firstDefined(flags.protocol, current.protocol),
      host: firstDefined(flags.host, current.host),
      port: flags.port === undefined ? current.port : normalizePort(flags.port),
      path: firstDefined(flags.apiPath, current.path),
      modelsPath: firstDefined(flags.modelsPath, current.modelsPath),
      key: firstDefined(flags.apiKey, current.key),
      model: firstDefined(flags.model, current.model),
    };
    delete cfg.apiKey;
    const savedApi = resolveApiConfig(cfg, { useEnv: false });
    cfg.api = apiForStorage(savedApi);
    saveConfig(cfg);
    console.log([
      "✅ API 配置已保存！",
      "",
      `🌐 Endpoint: ${savedApi.endpoint}`,
      `📚 Models: ${savedApi.modelsEndpoint}`,
      `🧠 Model: ${savedApi.model}`,
      `🔑 Key: ${previewSecret(savedApi.key) || "未设置"}`,
      `📁 Config: ${CONFIG_PATH}`,
    ].join("\n"));
    process.exit(0);
  }

  if (flags.setKey) {
    const cfg = loadConfig() || {};
    cfg.api = {
      ...(cfg.api && typeof cfg.api === "object" ? cfg.api : {}),
      key: flags.setKey,
    };
    delete cfg.apiKey;
    saveConfig(cfg);
    const api = resolveApiConfig(cfg, { useEnv: false });
    console.log(
      `✅ API Key 已保存到本地配置文件！\n\n` +
      `🔑 Key: ${previewSecret(flags.setKey)}\n` +
      `📁 ${CONFIG_PATH}\n` +
      `🌐 生成或编辑图片时，该 Key 会发送给 ${api.endpoint} 用于 API 认证`
    );
    process.exit(0);
  }

  if (flags.setQuickMode) {
    const cfg = loadConfig() || {};
    cfg.quickMode = {
      quality: (flags.quality || cfg.quickMode?.quality || DEFAULTS.quality).toUpperCase(),
      ratio:   (flags.ratio   || cfg.quickMode?.ratio   || DEFAULTS.ratio).toLowerCase(),
      count:   Math.max(1, Math.min(flags.count ?? cfg.quickMode?.count ?? DEFAULTS.count, 4)),
    };
    saveConfig(cfg);
    const q = cfg.quickMode.quality, r = cfg.quickMode.ratio;
    const s = resolveSize(q, r), n = cfg.quickMode.count;
    console.log([
      `✅ 设置完成！你的快速模式配置：`,
      ``,
      `🎨 画质: ${q} ${QUALITY_EMOJI[q] || ""}`,
      `📐 比例: ${RATIO_NAMES[r] || r} (${s})`,
      `🔢 每次: ${n} 张`,
      ``,
      `---`,
      ``,
      `💡 以后 @我 + 描述 → 直接出图，不用再选参数`,
      `⚙️ 随时说「修改配置」可以重新设置`,
      `📦 想一次生多张不同内容？说「批量生成」`,
    ].join("\n"));
    process.exit(0);
  }

  if (flags.setBatchMode) {
    const cfg = loadConfig() || {};
    cfg.batchMode = {
      quality:     (flags.quality     || cfg.batchMode?.quality     || DEFAULTS.quality).toUpperCase(),
      ratio:       (flags.ratio       || cfg.batchMode?.ratio       || DEFAULTS.ratio).toLowerCase(),
      concurrency: Math.max(1, Math.min(flags.concurrency ?? cfg.batchMode?.concurrency ?? DEFAULTS.concurrency, 10)),
    };
    saveConfig(cfg);
    const q = cfg.batchMode.quality, r = cfg.batchMode.ratio;
    const s = resolveSize(q, r), c = cfg.batchMode.concurrency;
    console.log([
      `✅ 批量模式已设置！`,
      ``,
      `🎨 画质: ${q} ${QUALITY_EMOJI[q] || ""}`,
      `📐 比例: ${RATIO_NAMES[r] || r} (${s})`,
      `⚡ 并发: ${c}`,
      ``,
      `💡 说「批量生成」+ 提示词列表即可开始`,
      `⚙️ 随时说「修改配置」可以调整`,
    ].join("\n"));
    process.exit(0);
  }

  if (flags.help || (prompts.length === 0 && !flags.batchFile && !flags.edit)) {
    printUsage();
    process.exit(0);
  }

  // ── Edit command ──

  if (flags.edit) {
    const images = flags.images || [];
    if (images.length === 0) { console.error("ERROR: --edit requires --image <path>"); process.exit(1); }
    if (prompts.length === 0) { console.error("ERROR: --edit requires --prompt <text>"); process.exit(1); }

    const api = getApiConfig();
    const cfg = loadConfig();
    const qm = cfg?.quickMode;
    const quality = (flags.quality || qm?.quality || DEFAULTS.quality).toUpperCase();
    const ratio = (flags.ratio || qm?.ratio || DEFAULTS.ratio).toLowerCase();
    const size = resolveSize(quality, ratio);
    if (!size) { console.error(`ERROR: Invalid quality="${quality}" or ratio="${ratio}".`); process.exit(1); }
    const outputDir = resolveOutputDir(flags.outputDir);

    if (images.length > 1) {
      const bm = cfg?.batchMode;
      const concurrency = Math.max(1, Math.min(flags.concurrency ?? bm?.concurrency ?? DEFAULTS.concurrency, 10));
      process.exit(await runBatchEdit(api, images, prompts[0], size, concurrency, outputDir));
    }

    const count = Math.max(1, Math.min(flags.count ?? 1, 4));

    if (count > 1) {
      const result = await editImage(api, images[0], prompts[0], size, outputDir, count);
      if (result.ok) {
        const NUM = ["①", "②", "③", "④"];
        const totalMB = result.results.reduce((sum, r) => sum + parseFloat(r.fileSize), 0).toFixed(2);
        console.log(`✏️ "${prompts[0]}" × ${count}\n`);
        console.log(`✅ ${(result.elapsed / 1000).toFixed(1)}s ｜ 共 ${totalMB}MB`);
        result.results.forEach((r, i) => console.log(`${NUM[i] || "·"} ${basename(r.path)}  ${r.fileSize}`));
        console.log(`📍 ${outputDir}`);
        console.log(`🖼️ 原图: ${result.sourceName}`);
      } else {
        console.error(`❌ 编辑失败: ${result.error}`);
        process.exit(1);
      }
      process.exit(0);
    }

    const result = await editImage(api, images[0], prompts[0], size, outputDir);
    if (result.ok) {
      console.log(`✏️ "${prompts[0]}"\n\n✅ ${(result.elapsed / 1000).toFixed(1)}s ｜ ${result.fileSize}\n📍 ${result.path}\n🖼️ 原图: ${result.sourceName}`);
    } else {
      console.error(`❌ 编辑失败: ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── Generation commands (need API key) ──

  const api = getApiConfig();
  const cfg = loadConfig();
  const isBatch = !!flags.batchFile || !!flags.batchInline;

  // Parameter resolution: explicit flag → mode config → hardcoded default
  let quality, ratio;
  if (isBatch) {
    const bm = cfg?.batchMode;
    quality = (flags.quality || bm?.quality || DEFAULTS.quality).toUpperCase();
    ratio   = (flags.ratio   || bm?.ratio   || DEFAULTS.ratio).toLowerCase();
  } else {
    const qm = cfg?.quickMode;
    quality = (flags.quality || qm?.quality || DEFAULTS.quality).toUpperCase();
    ratio   = (flags.ratio   || qm?.ratio   || DEFAULTS.ratio).toLowerCase();
  }

  const size = resolveSize(quality, ratio);
  if (!size) {
    console.error(`ERROR: Invalid quality="${quality}" or ratio="${ratio}".`);
    process.exit(1);
  }

  const outputDir = resolveOutputDir(flags.outputDir);

  // Batch from file
  if (flags.batchFile) {
    const bm = cfg?.batchMode;
    const concurrency = Math.max(1, Math.min(flags.concurrency ?? bm?.concurrency ?? DEFAULTS.concurrency, 10));
    const raw = readFileSync(flags.batchFile, "utf-8");
    const parsed = JSON.parse(raw);
    const bp = Array.isArray(parsed) ? parsed : parsed.prompts;
    if (!bp?.length) {
      console.error("ERROR: Batch file must be a JSON array of prompt strings.");
      process.exit(1);
    }
    process.exit(await runBatch(api, bp, size, concurrency, outputDir));
  }

  // Batch inline
  if (flags.batchInline && prompts.length >= 1) {
    const bm = cfg?.batchMode;
    const concurrency = Math.max(1, Math.min(flags.concurrency ?? bm?.concurrency ?? DEFAULTS.concurrency, 10));
    process.exit(await runBatch(api, prompts, size, concurrency, outputDir));
  }

  // Single prompt — resolve count from flag → quickMode config → default
  const prompt = prompts[0];
  const qm = cfg?.quickMode;
  const count = Math.max(1, Math.min(flags.count ?? qm?.count ?? DEFAULTS.count, 4));

  if (count > 1) {
    console.log();
    process.exit(await runBatch(api, Array(count).fill(prompt), size, Math.min(count, 4), outputDir, true));
  }

  // Single image
  console.log(`\n⏳ 生成中...\n`);

  const result = await generate(api, prompt, size, outputDir);
  if (result.ok) {
    console.log(`🎨 "${prompt}"\n\n✅ ${(result.elapsed / 1000).toFixed(1)}s ｜ ${result.fileSize}\n📍 ${result.path}`);
  } else {
    console.error(`❌ 生成失败: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
