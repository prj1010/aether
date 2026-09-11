from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Literal

LlmProvider = Literal[
    "openai", "azure", "anthropic", "groq", "ollama", "gemini",
    "mistral", "openrouter", "together", "xai", "custom",
]

PROVIDER_META: dict[str, dict] = {
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini", "keys": ["OPENAI_API_KEY"], "needs_key": True},
    "azure": {"label": "Azure OpenAI", "base_url": "", "model": "", "keys": ["AZURE_OPENAI_API_KEY"], "needs_key": True},
    "anthropic": {"label": "Anthropic", "base_url": "https://api.anthropic.com/v1", "model": "claude-sonnet-4-5", "keys": ["ANTHROPIC_API_KEY"], "needs_key": True},
    "groq": {"label": "Groq", "base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "keys": ["GROQ_API_KEY"], "needs_key": True},
    "ollama": {"label": "Ollama", "base_url": "http://127.0.0.1:11434/v1", "model": "llama3.1", "keys": [], "needs_key": False},
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.0-flash", "keys": ["GEMINI_API_KEY", "GOOGLE_API_KEY"], "needs_key": True},
    "mistral": {"label": "Mistral", "base_url": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "keys": ["MISTRAL_API_KEY"], "needs_key": True},
    "openrouter": {"label": "OpenRouter", "base_url": "https://openrouter.ai/api/v1", "model": "openai/gpt-4o-mini", "keys": ["OPENROUTER_API_KEY"], "needs_key": True},
    "together": {"label": "Together", "base_url": "https://api.together.xyz/v1", "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "keys": ["TOGETHER_API_KEY"], "needs_key": True},
    "xai": {"label": "xAI", "base_url": "https://api.x.ai/v1", "model": "grok-4.5", "keys": ["XAI_API_KEY"], "needs_key": True},
    "custom": {"label": "Custom (OpenAI-compatible)", "base_url": "", "model": "local-model", "keys": ["LLM_API_KEY"], "needs_key": False},
}

DETECT_ORDER = ["openai", "azure", "anthropic", "groq", "gemini", "mistral", "openrouter", "together", "xai"]
ALIASES = {"x-ai": "xai", "grok": "xai", "google": "gemini", "claude": "anthropic", "local": "ollama"}


@dataclass
class LlmConfig:
    provider: str
    model: str
    base_url: str
    api_key: str
    api_version: str | None = None
    deployment: str | None = None


@dataclass
class ChatResult:
    text: str
    model: str
    input_tokens: int
    output_tokens: int


def _pick(env: dict[str, str], keys: list[str]) -> str:
    for k in keys:
        v = env.get(k, "").strip()
        if v:
            return v
    return ""


def resolve_llm_config(env: dict[str, str] | None = None) -> LlmConfig | None:
    env = env if env is not None else {k: v for k, v in os.environ.items() if v is not None}
    raw = (env.get("LLM_PROVIDER") or "").strip().lower()
    explicit = ALIASES.get(raw, raw if raw in PROVIDER_META else "")
    base_override = (env.get("LLM_BASE_URL") or "").strip()
    model_override = (env.get("LLM_MODEL") or "").strip()
    key_override = (env.get("LLM_API_KEY") or "").strip()

    provider = explicit
    if not provider:
        if base_override:
            provider = "custom"
        else:
            for pid in DETECT_ORDER:
                meta = PROVIDER_META[pid]
                key = key_override or _pick(env, meta["keys"])
                if pid == "azure":
                    if key and env.get("AZURE_OPENAI_ENDPOINT") and env.get("AZURE_OPENAI_DEPLOYMENT"):
                        provider = "azure"
                        break
                    continue
                if key:
                    provider = pid
                    break
    if not provider and (env.get("OLLAMA_HOST") or env.get("OLLAMA_BASE_URL")):
        provider = "ollama"
    if not provider:
        return None

    meta = PROVIDER_META[provider]
    api_key = key_override or _pick(env, meta["keys"])

    if provider == "azure":
        endpoint = (base_override or (env.get("AZURE_OPENAI_ENDPOINT") or "")).rstrip("/")
        deployment = model_override or (env.get("AZURE_OPENAI_DEPLOYMENT") or "")
        api_version = env.get("AZURE_OPENAI_API_VERSION") or env.get("LLM_API_VERSION") or "2024-10-21"
        if not endpoint or not deployment or not api_key:
            return None
        return LlmConfig(provider, deployment, endpoint, api_key, api_version, deployment)

    if provider == "ollama":
        host = (base_override or env.get("OLLAMA_HOST") or env.get("OLLAMA_BASE_URL") or meta["base_url"]).rstrip("/")
        base_url = host if host.endswith("/v1") else host.rstrip("/") + "/v1"
        return LlmConfig(provider, model_override or meta["model"], base_url, api_key or "ollama")

    if provider == "custom":
        if not base_override:
            return None
        return LlmConfig(provider, model_override or meta["model"], base_override.rstrip("/"), api_key)

    if meta["needs_key"] and not api_key:
        return None
    return LlmConfig(provider, model_override or meta["model"], (base_override or meta["base_url"]).rstrip("/"), api_key)


def public_llm_status(env: dict[str, str] | None = None) -> dict:
    cfg = resolve_llm_config(env)
    if not cfg:
        return {"configured": False, "provider": "extractive", "model": "extractive", "label": "Extractive (no LLM)"}
    label = PROVIDER_META[cfg.provider]["label"]
    return {"configured": True, "provider": cfg.provider, "model": cfg.model, "label": f"{label} · {cfg.model}"}


def complete_chat(system: str, user: str, temperature: float = 0.1, max_tokens: int = 700, env: dict[str, str] | None = None) -> ChatResult | None:
    cfg = resolve_llm_config(env)
    if not cfg:
        return None
    try:
        if cfg.provider == "anthropic":
            return _anthropic(cfg, system, user, temperature, max_tokens)
        return _openai(cfg, system, user, temperature, max_tokens)
    except Exception:
        return None


def _post(url: str, headers: dict[str, str], payload: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _openai(cfg: LlmConfig, system: str, user: str, temperature: float, max_tokens: int) -> ChatResult | None:
    if cfg.provider == "azure":
        url = f"{cfg.base_url}/openai/deployments/{cfg.deployment}/chat/completions?api-version={cfg.api_version}"
        headers = {"Content-Type": "application/json", "api-key": cfg.api_key}
    else:
        url = f"{cfg.base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if cfg.api_key:
            headers["Authorization"] = f"Bearer {cfg.api_key}"
        if cfg.provider == "openrouter":
            headers["HTTP-Referer"] = "https://github.com/prj1010/aether"
            headers["X-Title"] = "Aether"
    body = _post(
        url,
        headers,
        {
            "model": cfg.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
    )
    text = ((body.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    text = text.strip()
    if not text:
        return None
    usage = body.get("usage") or {}
    return ChatResult(
        text=text,
        model=f"{cfg.provider}/{body.get('model') or cfg.model}",
        input_tokens=int(usage.get("prompt_tokens") or max(1, (len(system) + len(user)) // 4)),
        output_tokens=int(usage.get("completion_tokens") or max(1, len(text) // 4)),
    )


def _anthropic(cfg: LlmConfig, system: str, user: str, temperature: float, max_tokens: int) -> ChatResult | None:
    body = _post(
        f"{cfg.base_url}/messages",
        {
            "Content-Type": "application/json",
            "x-api-key": cfg.api_key,
            "anthropic-version": "2023-06-01",
        },
        {
            "model": cfg.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
    )
    text = "".join(b.get("text") or "" for b in (body.get("content") or []) if b.get("type") == "text").strip()
    if not text:
        return None
    usage = body.get("usage") or {}
    return ChatResult(
        text=text,
        model=f"{cfg.provider}/{body.get('model') or cfg.model}",
        input_tokens=int(usage.get("input_tokens") or max(1, (len(system) + len(user)) // 4)),
        output_tokens=int(usage.get("output_tokens") or max(1, len(text) // 4)),
    )
