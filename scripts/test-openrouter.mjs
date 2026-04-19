#!/usr/bin/env node
/**
 * scripts/test-openrouter.mjs
 *
 * Tests the OpenRouter configuration used by the API server.
 * Mirrors the exact key-resolution logic in:
 *   artifacts/api-server/src/routes/openrouter/index.ts
 *
 * Usage:
 *   node scripts/test-openrouter.mjs
 *   node scripts/test-openrouter.mjs --config path/to/config.json
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dir, "..");

// ── ANSI colours ──────────────────────────────────────────────────────────────
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const b = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const pass = g("✔ PASS");
const fail = r("✖ FAIL");
const skip = y("– SKIP");
const warn = y("⚠ WARN");

let failCount = 0;
let passCount = 0;

function ok(label, detail = "") {
  passCount++;
  console.log(`  ${pass}  ${label}${detail ? dim("  " + detail) : ""}`);
}

function bad(label, detail = "") {
  failCount++;
  console.log(`  ${fail}  ${label}${detail ? dim("  " + detail) : ""}`);
}

function note(label, detail = "") {
  console.log(`  ${warn}  ${label}${detail ? dim("  " + detail) : ""}`);
}

function masked(key) {
  if (!key) return r("(empty)");
  if (key.length <= 12) return r("(too short)");
  return dim(key.slice(0, 12)) + "…" + dim(key.slice(-4));
}

// ── 1. Load config.json ───────────────────────────────────────────────────────
const configArg = process.argv.indexOf("--config");
const configPath =
  configArg !== -1
    ? resolve(process.argv[configArg + 1])
    : join(ROOT, "artifacts", "api-server", "config.json");

console.log();
console.log(bold("  OpenRouter configuration test"));
console.log(dim(`  config file: ${configPath}`));
console.log();
console.log(b("  [1] Config file"));

let rawConfig = {};
if (!existsSync(configPath)) {
  note("config.json not found — env vars only", configPath);
} else {
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    ok("config.json loaded and valid JSON");
  } catch (e) {
    bad("config.json parse error", e.message);
    process.exit(1);
  }
}

const cfgOR = rawConfig?.openrouter ?? {};

// ── 2. Resolve values (mirrors server logic exactly) ─────────────────────────
console.log();
console.log(b("  [2] Value resolution"));

// apiKey: config strips trailing ".N" suffix (e.g. "sk-or-v1-abc.1" → "sk-or-v1-abc")
const rawCfgKey = cfgOR.apiKey?.trim() ?? "";
const cfgKey = rawCfgKey ? rawCfgKey.split(".")[0] : "";
const envKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ?? "";

let apiKey, apiKeySource;
if (cfgKey) {
  apiKey = cfgKey;
  apiKeySource = "config.json";
} else if (envKey) {
  apiKey = envKey;
  apiKeySource = "env AI_INTEGRATIONS_OPENROUTER_API_KEY";
} else {
  apiKey = "";
  apiKeySource = r("not set");
}

// apiUrl
const cfgUrl = cfgOR.apiUrl?.trim() ?? "";
const envUrl = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ?? "";

let apiUrl, apiUrlSource;
if (cfgUrl) {
  apiUrl = cfgUrl;
  apiUrlSource = "config.json";
} else if (envUrl) {
  apiUrl = envUrl;
  apiUrlSource = "env AI_INTEGRATIONS_OPENROUTER_BASE_URL";
} else {
  apiUrl = "https://openrouter.ai/api/v1";
  apiUrlSource = dim("default");
}

// model
const cfgModel = cfgOR.model?.trim() ?? "";
const envModel = process.env.OPENROUTER_MODEL ?? "";

let model, modelSource;
if (cfgModel) {
  model = cfgModel;
  modelSource = "config.json";
} else if (envModel) {
  model = envModel;
  modelSource = "env OPENROUTER_MODEL";
} else {
  model = "openrouter/auto";
  modelSource = dim("default");
}

console.log(`  ${"apiKey".padEnd(8)} ${masked(apiKey)}  ${dim("← " + apiKeySource)}`);
console.log(`  ${"apiUrl".padEnd(8)} ${apiUrl}  ${dim("← " + apiUrlSource)}`);
console.log(`  ${"model".padEnd(8)} ${model}  ${dim("← " + modelSource)}`);

if (rawCfgKey && rawCfgKey !== cfgKey) {
  note(
    "key suffix stripped",
    `"${rawCfgKey.slice(-6)}" → "${cfgKey.slice(-6)}"  (trailing .N removed)`
  );
}

if (!apiKey) {
  bad("No API key resolved — cannot proceed with API tests");
  console.log();
  process.exit(1);
}
ok("API key present");

// ── 3. Reachability ───────────────────────────────────────────────────────────
console.log();
console.log(b("  [3] Reachability"));

const baseUrl = apiUrl.replace(/\/$/, "");

async function apiGet(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "story-together-config-test",
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function apiPost(path, payload) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "story-together-config-test",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

// GET /models
let modelsRes;
try {
  modelsRes = await apiGet("/models");
  if (modelsRes.ok) {
    ok("GET /models reachable", `HTTP ${modelsRes.status}`);
  } else {
    bad(
      "GET /models returned error",
      `HTTP ${modelsRes.status} — ${modelsRes.body?.error?.message ?? JSON.stringify(modelsRes.body)}`
    );
  }
} catch (e) {
  bad("GET /models failed", e.message);
  modelsRes = null;
}

// ── 4. Model validation ───────────────────────────────────────────────────────
console.log();
console.log(b("  [4] Model"));

if (modelsRes?.ok) {
  const modelList = modelsRes.body?.data ?? [];
  const found = modelList.find((m) => m.id === model);

  if (model === "openrouter/auto" || model === "openrouter/free") {
    ok(`Model "${model}" is a special OpenRouter routing alias — always valid`);
  } else if (found) {
    ok(`Model "${model}" found in available models`);
    if (found.context_length) {
      console.log(
        `          context_length: ${found.context_length.toLocaleString()}`
      );
    }
  } else {
    bad(`Model "${model}" not found in available models`);
    if (modelList.length > 0) {
      const sample = modelList
        .slice(0, 5)
        .map((m) => m.id)
        .join(", ");
      console.log(dim(`          Available (first 5): ${sample}`));
    }
  }
} else {
  note(`Skipping model check (models list unavailable)`);
}

// ── 5. Auth / key validity ────────────────────────────────────────────────────
console.log();
console.log(b("  [5] Auth"));

let authRes;
try {
  authRes = await apiGet("/auth/key");
  if (authRes.ok) {
    const d = authRes.body?.data ?? authRes.body;
    ok("API key is valid", `limit: ${d?.limit ?? "?"}, usage: ${d?.usage ?? "?"}`);
    if (d?.is_free_tier) {
      note("Key is on the free tier — rate limits apply");
    }
  } else if (authRes.status === 401 || authRes.status === 403) {
    bad(
      "API key rejected",
      authRes.body?.error?.message ?? `HTTP ${authRes.status}`
    );
  } else {
    note("Auth endpoint unexpected status", `HTTP ${authRes.status}`);
  }
} catch (e) {
  note("Auth endpoint not available", e.message);
}

// ── 6. Chat completion (smoke test) ──────────────────────────────────────────
console.log();
console.log(b("  [6] Chat completion smoke test"));

try {
  const chatRes = await apiPost("/chat/completions", {
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: 'Reply with exactly the word "ok".' }],
  });

  if (chatRes.ok) {
    const reply = chatRes.body?.choices?.[0]?.message?.content?.trim() ?? "";
    const usedModel = chatRes.body?.model ?? model;
    ok("Chat completion succeeded", `routed to: ${usedModel}`);
    console.log(`          reply: ${dim(reply || "(empty)")}`);

    const cost = chatRes.body?.usage?.total_tokens;
    if (cost !== undefined) {
      console.log(`          tokens used: ${cost}`);
    }
  } else {
    const msg =
      chatRes.body?.error?.message ??
      chatRes.body?.error ??
      JSON.stringify(chatRes.body);
    if (chatRes.status === 402) {
      bad("Insufficient credits", msg);
    } else if (chatRes.status === 429) {
      note("Rate limited", msg);
    } else {
      bad(`Chat completion failed (HTTP ${chatRes.status})`, msg);
    }
  }
} catch (e) {
  bad("Chat completion request threw", e.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log();
console.log("  " + "─".repeat(48));
if (failCount === 0) {
  console.log(`  ${g("All checks passed.")}  (${passCount} passed)`);
} else {
  console.log(
    `  ${r(`${failCount} check(s) failed.`)}  ${passCount} passed, ${failCount} failed`
  );
}
console.log();

process.exit(failCount > 0 ? 1 : 0);
