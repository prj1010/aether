package aether

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type LlmConfig struct {
	Provider   string
	Model      string
	BaseURL    string
	APIKey     string
	APIVersion string
	Deployment string
}

type ChatResult struct {
	Text         string
	Model        string
	InputTokens  int
	OutputTokens int
}

type providerMeta struct {
	Label    string
	BaseURL  string
	Model    string
	Keys     []string
	NeedsKey bool
}

var providers = map[string]providerMeta{
	"openai":     {"OpenAI", "https://api.openai.com/v1", "gpt-4o-mini", []string{"OPENAI_API_KEY"}, true},
	"azure":      {"Azure OpenAI", "", "", []string{"AZURE_OPENAI_API_KEY"}, true},
	"anthropic":  {"Anthropic", "https://api.anthropic.com/v1", "claude-sonnet-4-5", []string{"ANTHROPIC_API_KEY"}, true},
	"groq":       {"Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", []string{"GROQ_API_KEY"}, true},
	"ollama":     {"Ollama", "http://127.0.0.1:11434/v1", "llama3.1", nil, false},
	"gemini":     {"Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash", []string{"GEMINI_API_KEY", "GOOGLE_API_KEY"}, true},
	"mistral":    {"Mistral", "https://api.mistral.ai/v1", "mistral-small-latest", []string{"MISTRAL_API_KEY"}, true},
	"openrouter": {"OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", []string{"OPENROUTER_API_KEY"}, true},
	"together":   {"Together", "https://api.together.xyz/v1", "meta-llama/Llama-3.3-70B-Instruct-Turbo", []string{"TOGETHER_API_KEY"}, true},
	"xai":        {"xAI", "https://api.x.ai/v1", "grok-4.5", []string{"XAI_API_KEY"}, true},
	"custom":     {"Custom (OpenAI-compatible)", "", "local-model", []string{"LLM_API_KEY"}, false},
}

var detectOrder = []string{"openai", "azure", "anthropic", "groq", "gemini", "mistral", "openrouter", "together", "xai"}

func getenv(k string) string { return strings.TrimSpace(os.Getenv(k)) }

func pickKey(keys []string) string {
	for _, k := range keys {
		if v := getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func normalizeProvider(raw string) string {
	p := strings.ToLower(strings.TrimSpace(raw))
	switch p {
	case "x-ai", "grok":
		return "xai"
	case "google":
		return "gemini"
	case "claude":
		return "anthropic"
	case "local":
		return "ollama"
	}
	if _, ok := providers[p]; ok {
		return p
	}
	return ""
}

// ResolveLlmConfig reads process env. Nil means extractive fallback.
func ResolveLlmConfig() *LlmConfig {
	explicit := normalizeProvider(getenv("LLM_PROVIDER"))
	base := getenv("LLM_BASE_URL")
	model := getenv("LLM_MODEL")
	key := getenv("LLM_API_KEY")
	provider := explicit
	if provider == "" {
		if base != "" {
			provider = "custom"
		} else {
			for _, pid := range detectOrder {
				meta := providers[pid]
				k := key
				if k == "" {
					k = pickKey(meta.Keys)
				}
				if pid == "azure" {
					if k != "" && getenv("AZURE_OPENAI_ENDPOINT") != "" && getenv("AZURE_OPENAI_DEPLOYMENT") != "" {
						provider = "azure"
						break
					}
					continue
				}
				if k != "" {
					provider = pid
					break
				}
			}
		}
	}
	if provider == "" && (getenv("OLLAMA_HOST") != "" || getenv("OLLAMA_BASE_URL") != "") {
		provider = "ollama"
	}
	if provider == "" {
		return nil
	}
	meta := providers[provider]
	apiKey := key
	if apiKey == "" {
		apiKey = pickKey(meta.Keys)
	}
	if provider == "azure" {
		endpoint := strings.TrimRight(firstNonEmpty(base, getenv("AZURE_OPENAI_ENDPOINT")), "/")
		dep := firstNonEmpty(model, getenv("AZURE_OPENAI_DEPLOYMENT"))
		ver := firstNonEmpty(getenv("AZURE_OPENAI_API_VERSION"), getenv("LLM_API_VERSION"), "2024-10-21")
		if endpoint == "" || dep == "" || apiKey == "" {
			return nil
		}
		return &LlmConfig{Provider: provider, Model: dep, BaseURL: endpoint, APIKey: apiKey, APIVersion: ver, Deployment: dep}
	}
	if provider == "ollama" {
		host := firstNonEmpty(base, getenv("OLLAMA_HOST"), getenv("OLLAMA_BASE_URL"), meta.BaseURL)
		host = strings.TrimRight(host, "/")
		if !strings.HasSuffix(host, "/v1") {
			host += "/v1"
		}
		if apiKey == "" {
			apiKey = "ollama"
		}
		return &LlmConfig{Provider: provider, Model: firstNonEmpty(model, meta.Model), BaseURL: host, APIKey: apiKey}
	}
	if provider == "custom" {
		if base == "" {
			return nil
		}
		return &LlmConfig{Provider: provider, Model: firstNonEmpty(model, meta.Model), BaseURL: strings.TrimRight(base, "/"), APIKey: apiKey}
	}
	if meta.NeedsKey && apiKey == "" {
		return nil
	}
	return &LlmConfig{Provider: provider, Model: firstNonEmpty(model, meta.Model), BaseURL: strings.TrimRight(firstNonEmpty(base, meta.BaseURL), "/"), APIKey: apiKey}
}

func firstNonEmpty(xs ...string) string {
	for _, x := range xs {
		if x != "" {
			return x
		}
	}
	return ""
}

// PublicLlmStatus never includes secrets.
func PublicLlmStatus() map[string]any {
	cfg := ResolveLlmConfig()
	if cfg == nil {
		return map[string]any{"configured": false, "provider": "extractive", "model": "extractive", "label": "Extractive (no LLM)"}
	}
	return map[string]any{"configured": true, "provider": cfg.Provider, "model": cfg.Model, "label": providers[cfg.Provider].Label + " · " + cfg.Model}
}

func completeChat(system, user string) *ChatResult {
	cfg := ResolveLlmConfig()
	if cfg == nil {
		return nil
	}
	res, err := postOpenAI(cfg, system, user)
	if err != nil {
		return nil
	}
	return res
}

func postOpenAI(cfg *LlmConfig, system, user string) (*ChatResult, error) {
	url := cfg.BaseURL + "/chat/completions"
	headers := map[string]string{"Content-Type": "application/json"}
	if cfg.Provider == "azure" {
		url = cfg.BaseURL + "/openai/deployments/" + cfg.Deployment + "/chat/completions?api-version=" + cfg.APIVersion
		headers["api-key"] = cfg.APIKey
	} else if cfg.APIKey != "" {
		headers["Authorization"] = "Bearer " + cfg.APIKey
	}
	payload := map[string]any{
		"model":       cfg.Model,
		"temperature": 0.1,
		"max_tokens":  700,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body)
		return nil, err
	}
	var body struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	text := ""
	if len(body.Choices) > 0 {
		text = strings.TrimSpace(body.Choices[0].Message.Content)
	}
	if text == "" {
		return nil, io.EOF
	}
	return &ChatResult{Text: text, Model: cfg.Provider + "/" + firstNonEmpty(body.Model, cfg.Model), InputTokens: body.Usage.PromptTokens, OutputTokens: body.Usage.CompletionTokens}, nil
}
