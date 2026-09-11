/**
 * Pluggable chat completions. Retrieval is independent of the generator.
 * Configure with LLM_PROVIDER + LLM_API_KEY / LLM_MODEL / LLM_BASE_URL,
 * or drop a vendor key and let auto-detect pick the first one present.
 */

export type LlmProvider =
  | "openai"
  | "azure"
  | "anthropic"
  | "groq"
  | "ollama"
  | "gemini"
  | "mistral"
  | "openrouter"
  | "together"
  | "xai"
  | "custom";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  apiVersion?: string;
  deployment?: string;
}

export interface LlmPublicStatus {
  configured: boolean;
  provider: LlmProvider | "extractive";
  model: string;
  label: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const PROVIDER_META: Record<
  LlmProvider,
  { label: string; baseUrl: string; model: string; keyEnvs: string[]; needsKey: boolean }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyEnvs: ["OPENAI_API_KEY"],
    needsKey: true,
  },
  azure: {
    label: "Azure OpenAI",
    baseUrl: "",
    model: "",
    keyEnvs: ["AZURE_OPENAI_API_KEY"],
    needsKey: true,
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    keyEnvs: ["ANTHROPIC_API_KEY"],
    needsKey: true,
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyEnvs: ["GROQ_API_KEY"],
    needsKey: true,
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    keyEnvs: [],
    needsKey: false,
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    keyEnvs: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    needsKey: true,
  },
  mistral: {
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    keyEnvs: ["MISTRAL_API_KEY"],
    needsKey: true,
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    keyEnvs: ["OPENROUTER_API_KEY"],
    needsKey: true,
  },
  together: {
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    keyEnvs: ["TOGETHER_API_KEY"],
    needsKey: true,
  },
  xai: {
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.5",
    keyEnvs: ["XAI_API_KEY"],
    needsKey: true,
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    model: "local-model",
    keyEnvs: ["LLM_API_KEY"],
    needsKey: false,
  },
};

const DETECT_ORDER: LlmProvider[] = [
  "openai",
  "azure",
  "anthropic",
  "groq",
  "gemini",
  "mistral",
  "openrouter",
  "together",
  "xai",
];

const KNOWN = new Set<string>(Object.keys(PROVIDER_META));

export function providerLabel(id: LlmProvider | "extractive"): string {
  if (id === "extractive") return "Extractive (no LLM)";
  return PROVIDER_META[id].label;
}

function pick(env: Record<string, string | undefined>, keys: string[]): string {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return "";
}

function normalizeProvider(raw: string | undefined): LlmProvider | undefined {
  const id = raw?.trim().toLowerCase();
  if (!id) return undefined;
  if (id === "x-ai" || id === "grok") return "xai";
  if (id === "google") return "gemini";
  if (id === "claude") return "anthropic";
  if (id === "local") return "ollama";
  if (KNOWN.has(id)) return id as LlmProvider;
  return undefined;
}

/** Resolve generator config from env. Returns null → extractive fallback. */
export function resolveLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig | null {
  const explicit = normalizeProvider(env.LLM_PROVIDER);
  const baseOverride = env.LLM_BASE_URL?.trim() ?? "";
  const modelOverride = env.LLM_MODEL?.trim() ?? "";
  const keyOverride = env.LLM_API_KEY?.trim() ?? "";

  let provider = explicit;
  if (!provider) {
    if (baseOverride) provider = "custom";
    else {
      for (const id of DETECT_ORDER) {
        const meta = PROVIDER_META[id];
        const key = keyOverride || pick(env, meta.keyEnvs);
        if (id === "azure") {
          const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
          const deployment = env.AZURE_OPENAI_DEPLOYMENT?.trim();
          if (key && endpoint && deployment) {
            provider = "azure";
            break;
          }
          continue;
        }
        if (key) {
          provider = id;
          break;
        }
      }
    }
  }
  if (!provider && (env.OLLAMA_HOST?.trim() || env.OLLAMA_BASE_URL?.trim())) {
    provider = "ollama";
  }
  if (!provider) return null;

  const meta = PROVIDER_META[provider];
  const apiKey = keyOverride || pick(env, meta.keyEnvs);

  if (provider === "azure") {
    const endpoint = (baseOverride || env.AZURE_OPENAI_ENDPOINT?.trim() || "").replace(/\/+$/, "");
    const deployment = modelOverride || env.AZURE_OPENAI_DEPLOYMENT?.trim() || "";
    const apiVersion = env.AZURE_OPENAI_API_VERSION?.trim() || env.LLM_API_VERSION?.trim() || "2024-10-21";
    if (!endpoint || !deployment || !apiKey) return null;
    return {
      provider,
      model: deployment,
      baseUrl: endpoint,
      apiKey,
      apiVersion,
      deployment,
    };
  }

  if (provider === "ollama") {
    const host = (baseOverride || env.OLLAMA_HOST?.trim() || env.OLLAMA_BASE_URL?.trim() || meta.baseUrl).replace(
      /\/+$/,
      "",
    );
    const baseUrl = host.endsWith("/v1") ? host : `${host.replace(/\/v1$/, "")}/v1`;
    return {
      provider,
      model: modelOverride || meta.model,
      baseUrl,
      apiKey: apiKey || "ollama",
    };
  }

  if (provider === "custom") {
    if (!baseOverride) return null;
    return {
      provider,
      model: modelOverride || meta.model,
      baseUrl: baseOverride.replace(/\/+$/, ""),
      apiKey,
    };
  }

  if (meta.needsKey && !apiKey) return null;

  return {
    provider,
    model: modelOverride || meta.model,
    baseUrl: (baseOverride || meta.baseUrl).replace(/\/+$/, ""),
    apiKey,
  };
}

export function publicLlmStatus(
  env: Record<string, string | undefined> = process.env,
): LlmPublicStatus {
  const cfg = resolveLlmConfig(env);
  if (!cfg) {
    return { configured: false, provider: "extractive", model: "extractive", label: providerLabel("extractive") };
  }
  return {
    configured: true,
    provider: cfg.provider,
    model: cfg.model,
    label: `${providerLabel(cfg.provider)} · ${cfg.model}`,
  };
}

export async function completeChat(
  req: ChatRequest,
  env: Record<string, string | undefined> = process.env,
): Promise<ChatResult | null> {
  const cfg = resolveLlmConfig(env);
  if (!cfg) return null;
  try {
    if (cfg.provider === "anthropic") return await completeAnthropic(cfg, req);
    return await completeOpenAiCompatible(cfg, req);
  } catch {
    return null;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms).unref?.();
  return ctrl.signal;
}

async function completeOpenAiCompatible(cfg: LlmConfig, req: ChatRequest): Promise<ChatResult | null> {
  const url =
    cfg.provider === "azure"
      ? `${cfg.baseUrl}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`
      : `${cfg.baseUrl}/chat/completions`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.provider === "azure") {
    headers["api-key"] = cfg.apiKey;
  } else if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/prj1010/aether";
    headers["X-Title"] = "Aether";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: timeoutSignal(30_000),
    body: JSON.stringify({
      model: cfg.model,
      temperature: req.temperature ?? 0.1,
      max_tokens: req.maxTokens ?? 700,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return null;
  return {
    text,
    model: `${cfg.provider}/${body.model || cfg.model}`,
    inputTokens: body.usage?.prompt_tokens ?? Math.ceil((req.system.length + req.user.length) / 4),
    outputTokens: body.usage?.completion_tokens ?? Math.ceil(text.length / 4),
  };
}

async function completeAnthropic(cfg: LlmConfig, req: ChatRequest): Promise<ChatResult | null> {
  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: timeoutSignal(30_000),
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 700,
      temperature: req.temperature ?? 0.1,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    model?: string;
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim() ?? "";
  if (!text) return null;
  return {
    text,
    model: `${cfg.provider}/${body.model || cfg.model}`,
    inputTokens: body.usage?.input_tokens ?? Math.ceil((req.system.length + req.user.length) / 4),
    outputTokens: body.usage?.output_tokens ?? Math.ceil(text.length / 4),
  };
}

export const LLM_PROVIDERS = (Object.keys(PROVIDER_META) as LlmProvider[]).map((id) => ({
  id,
  label: PROVIDER_META[id].label,
  defaultModel: PROVIDER_META[id].model || "(deployment name)",
  keyEnvs: PROVIDER_META[id].keyEnvs,
  needsKey: PROVIDER_META[id].needsKey,
}));
