import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLlmStatus, resolveLlmConfig } from "./llm.ts";

test("no keys → extractive", () => {
  assert.equal(resolveLlmConfig({}), null);
  const st = publicLlmStatus({});
  assert.equal(st.configured, false);
  assert.equal(st.provider, "extractive");
});

test("auto-detects OpenAI before xAI", () => {
  const cfg = resolveLlmConfig({
    OPENAI_API_KEY: "sk-test",
    XAI_API_KEY: "xai-test",
  });
  assert.equal(cfg?.provider, "openai");
  assert.equal(cfg?.model, "gpt-4o-mini");
});

test("XAI_API_KEY still works when it is the only key", () => {
  const cfg = resolveLlmConfig({ XAI_API_KEY: "xai-test" });
  assert.equal(cfg?.provider, "xai");
  assert.equal(cfg?.model, "grok-4.5");
});

test("LLM_PROVIDER wins over auto-detect", () => {
  const cfg = resolveLlmConfig({
    LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "ant-test",
    OPENAI_API_KEY: "sk-test",
    LLM_MODEL: "claude-sonnet-4-5",
  });
  assert.equal(cfg?.provider, "anthropic");
  assert.equal(cfg?.model, "claude-sonnet-4-5");
});

test("aliases: grok → xai, claude → anthropic, local → ollama", () => {
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "grok", XAI_API_KEY: "k" })?.provider, "xai");
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "claude", ANTHROPIC_API_KEY: "k" })?.provider, "anthropic");
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "local" })?.provider, "ollama");
});

test("LLM_API_KEY and LLM_MODEL override vendor defaults", () => {
  const cfg = resolveLlmConfig({
    LLM_PROVIDER: "openai",
    LLM_API_KEY: "sk-shared",
    LLM_MODEL: "gpt-4.1",
    LLM_BASE_URL: "https://example.invalid/v1",
  });
  assert.equal(cfg?.apiKey, "sk-shared");
  assert.equal(cfg?.model, "gpt-4.1");
  assert.equal(cfg?.baseUrl, "https://example.invalid/v1");
});

test("explicit provider without a key is extractive (except ollama/custom)", () => {
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "openai" }), null);
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "ollama" })?.provider, "ollama");
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "custom", LLM_BASE_URL: "http://127.0.0.1:8000/v1" })?.provider, "custom");
  assert.equal(resolveLlmConfig({ LLM_PROVIDER: "custom" }), null);
});

test("azure needs endpoint, deployment, and key", () => {
  assert.equal(resolveLlmConfig({ AZURE_OPENAI_API_KEY: "k" }), null);
  const cfg = resolveLlmConfig({
    AZURE_OPENAI_API_KEY: "k",
    AZURE_OPENAI_ENDPOINT: "https://ns.openai.azure.com/",
    AZURE_OPENAI_DEPLOYMENT: "gpt-4o",
  });
  assert.equal(cfg?.provider, "azure");
  assert.equal(cfg?.deployment, "gpt-4o");
  assert.equal(cfg?.baseUrl, "https://ns.openai.azure.com");
  assert.equal(cfg?.apiVersion, "2024-10-21");
});

test("public status never includes the key", () => {
  const st = publicLlmStatus({ OPENAI_API_KEY: "sk-secret" });
  assert.equal(st.configured, true);
  assert.equal(st.label.includes("sk-secret"), false);
  assert.equal(JSON.stringify(st).includes("sk-secret"), false);
});
