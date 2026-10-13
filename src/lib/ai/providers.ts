import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import type { AiProvider } from "@/db/schema";

export const PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; needsBaseUrl?: boolean }> = {
  anthropic: { label: "Anthropic (Claude)", defaultModel: "claude-haiku-5-5" },
  openai: { label: "OpenAI (ChatGPT)", defaultModel: "gpt-5.4-mini" },
  mistral: { label: "Mistral", defaultModel: "mistral-small-latest" },
  xai: { label: "xAI (Grok)", defaultModel: "grok-latest" },
  google: { label: "Google (Gemini)", defaultModel: "gemini-3.5-flash-lite" },
  "openai-compatible": {
    label: "Self-hosted / OpenAI-compatible (Ollama, vLLM, LM Studio, OpenRouter…)",
    defaultModel: "llama3.2",
    needsBaseUrl: true,
  },
};

export type AiConfig = {
  provider: AiProvider;
  model?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
};

export function isProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && value in PROVIDERS;
}

/** Instance-wide fallback configured through env vars. */
export function envAiConfig(): AiConfig | null {
  const provider = process.env.AI_PROVIDER;
  if (!isProvider(provider)) return null;
  return {
    provider,
    model: process.env.AI_MODEL,
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
  };
}

export function createModel(config: AiConfig): LanguageModel {
  const model = config.model || PROVIDERS[config.provider].defaultModel;
  const apiKey = config.apiKey || undefined;
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "mistral":
      return createMistral({ apiKey })(model);
    case "xai":
      return createXai({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "openai-compatible":
      if (!config.baseUrl) throw new Error("Base URL is required for an OpenAI-compatible provider");
      return createOpenAICompatible({ name: "custom", baseURL: config.baseUrl, apiKey })(model);
  }
}
