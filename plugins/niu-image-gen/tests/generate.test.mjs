import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";


const SCRIPT_PATH = fileURLToPath(
  new URL("../scripts/generate.mjs", import.meta.url)
);
const API_ENV_KEYS = [
  "NIU_IMAGE_GEN_API_PROTOCOL",
  "NIU_IMAGE_GEN_API_HOST",
  "NIU_IMAGE_GEN_API_PORT",
  "NIU_IMAGE_GEN_API_PATH",
  "NIU_IMAGE_GEN_API_MODELS_PATH",
  "NIU_IMAGE_GEN_API_KEY",
  "NIU_IMAGE_GEN_API_MODEL",
];


async function createTestHome(t) {
  const home = await mkdtemp(join(tmpdir(), "niu-image-gen-test-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}


function childEnvironment(home, overrides = {}) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    ...overrides,
  };
  for (const key of API_ENV_KEYS) {
    if (!(key in overrides)) {
      delete env[key];
    }
  }
  return env;
}


function runCli(args, { home, env = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      env: childEnvironment(home, env),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}


async function writeConfig(home, payload) {
  const path = join(home, ".codex", "niu-image-gen-config.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  return path;
}


test("saves and reports a custom API endpoint", async (t) => {
  const home = await createTestHome(t);
  const result = await runCli(
    [
      "--set-api",
      "--protocol",
      "http",
      "--host",
      "127.0.0.1",
      "--port",
      "9001",
      "--path",
      "custom/images",
      "--models-path",
      "custom/models",
      "--model",
      "custom-image-model",
      "--key",
      "custom-key-123456",
    ],
    { home }
  );

  assert.equal(result.code, 0, result.stderr);
  const config = JSON.parse(
    await readFile(join(home, ".codex", "niu-image-gen-config.json"), "utf8")
  );
  assert.deepEqual(config.api, {
    protocol: "http",
    host: "127.0.0.1",
    port: 9001,
    path: "/custom/images",
    modelsPath: "/custom/models",
    key: "custom-key-123456",
    model: "custom-image-model",
  });

  const getResult = await runCli(["--get-config"], { home });
  assert.equal(getResult.code, 0, getResult.stderr);
  const reported = JSON.parse(getResult.stdout);
  assert.equal(reported.api.endpoint, "http://127.0.0.1:9001/custom/images");
  assert.equal(
    reported.api.modelsEndpoint,
    "http://127.0.0.1:9001/custom/models"
  );
  assert.equal(reported.api.model, "custom-image-model");
  assert.equal(reported.keySource, "config.api.key");
  assert.equal(reported.hasKey, true);
});


test("environment variables override saved API settings", async (t) => {
  const home = await createTestHome(t);
  await writeConfig(home, {
    api: {
      protocol: "https",
      host: "saved.example.com",
      port: null,
      path: "/saved",
      modelsPath: "/saved-models",
      key: "saved-key",
      model: "saved-model",
    },
  });

  const result = await runCli(["--get-config"], {
    home,
    env: {
      NIU_IMAGE_GEN_API_PROTOCOL: "http",
      NIU_IMAGE_GEN_API_HOST: "localhost",
      NIU_IMAGE_GEN_API_PORT: "8123",
      NIU_IMAGE_GEN_API_PATH: "/override",
      NIU_IMAGE_GEN_API_MODELS_PATH: "/override-models",
      NIU_IMAGE_GEN_API_KEY: "environment-key",
      NIU_IMAGE_GEN_API_MODEL: "environment-model",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const reported = JSON.parse(result.stdout);
  assert.equal(reported.api.endpoint, "http://localhost:8123/override");
  assert.equal(
    reported.api.modelsEndpoint,
    "http://localhost:8123/override-models"
  );
  assert.equal(reported.api.model, "environment-model");
  assert.equal(reported.api.modelSource, "NIU_IMAGE_GEN_API_MODEL");
  assert.equal(reported.keySource, "NIU_IMAGE_GEN_API_KEY");
});


test("migrates a legacy top-level apiKey", async (t) => {
  const home = await createTestHome(t);
  const configPath = await writeConfig(home, {
    apiKey: "legacy-key",
    quickMode: { quality: "2K", ratio: "square", count: 1 },
  });

  const before = await runCli(["--get-config"], { home });
  assert.equal(before.code, 0, before.stderr);
  assert.equal(JSON.parse(before.stdout).keySource, "legacy config.apiKey");

  const update = await runCli(["--set-key", "replacement-key"], { home });
  assert.equal(update.code, 0, update.stderr);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.apiKey, undefined);
  assert.equal(config.api.key, "replacement-key");
  assert.deepEqual(config.quickMode, {
    quality: "2K",
    ratio: "square",
    count: 1,
  });
});


test("sends requests to the configured host, port, path, key, and model", async (t) => {
  const home = await createTestHome(t);
  const outputDir = join(home, "output");
  let received;

  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    received = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        data: [{ b64_json: Buffer.from("fake-png").toString("base64") }],
      })
    );
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.notEqual(address, null);
  await writeConfig(home, {
    api: {
      protocol: "http",
      host: "127.0.0.1",
      port: address.port,
      path: "/custom/v2/images",
      key: "request-key",
      model: "request-model",
    },
  });

  const result = await runCli(
    [
      "--prompt",
      "test prompt",
      "--quality",
      "1K",
      "--ratio",
      "square",
      "--output-dir",
      outputDir,
    ],
    { home }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(received, {
    method: "POST",
    url: "/custom/v2/images",
    authorization: "Bearer request-key",
    body: {
      model: "request-model",
      prompt: "test prompt",
      n: 1,
      size: "1024x1024",
    },
  });
  assert.match(result.stdout, /fake-png|生成中|test prompt/);
});


test("queries models from the configured models endpoint", async (t) => {
  const home = await createTestHome(t);
  let received;

  const server = createServer((request, response) => {
    received = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "text-model", owned_by: "relay" },
          { id: "custom-image-v2", owned_by: "relay" },
          { id: "gpt-image-compatible", owned_by: "relay" },
        ],
      })
    );
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.notEqual(address, null);
  await writeConfig(home, {
    api: {
      protocol: "http",
      host: "127.0.0.1",
      port: address.port,
      path: "/generate",
      modelsPath: "/relay/v1/models",
      key: "models-key",
      model: "old-model",
    },
  });

  const result = await runCli(["--list-models"], { home });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(received, {
    method: "GET",
    url: "/relay/v1/models",
    authorization: "Bearer models-key",
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.count, 3);
  assert.equal(payload.selectedModel, "old-model");
  assert.equal(payload.selectedModelAvailable, false);
  assert.deepEqual(payload.likelyImageModels, [
    "custom-image-v2",
    "gpt-image-compatible",
  ]);
  assert.deepEqual(
    payload.models.map((model) => model.id),
    ["custom-image-v2", "gpt-image-compatible", "text-model"]
  );
});


test("sets a selected model without changing other API settings", async (t) => {
  const home = await createTestHome(t);
  const configPath = await writeConfig(home, {
    api: {
      protocol: "https",
      host: "relay.example.com",
      port: 9443,
      path: "/images",
      modelsPath: "/models",
      key: "preserved-key",
      model: "old-model",
    },
    batchMode: {
      quality: "2K",
      ratio: "landscape",
      concurrency: 3,
    },
  });

  const result = await runCli(
    ["--set-model", "selected-image-model"],
    { home }
  );
  assert.equal(result.code, 0, result.stderr);

  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(config.api, {
    protocol: "https",
    host: "relay.example.com",
    port: 9443,
    path: "/images",
    modelsPath: "/models",
    key: "preserved-key",
    model: "selected-image-model",
  });
  assert.deepEqual(config.batchMode, {
    quality: "2K",
    ratio: "landscape",
    concurrency: 3,
  });
});


test("rejects invalid API ports without a stack trace", async (t) => {
  const home = await createTestHome(t);
  const result = await runCli(
    ["--set-api", "--port", "70000"],
    { home }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /1 to 65535/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
