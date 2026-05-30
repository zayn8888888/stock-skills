import { getConfig } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/**
 * Return a singleton Anthropic SDK client configured from the application
 * environment (LLM_API_KEY and LLM_BASE_URL).
 */
export function getLLMClient(): Anthropic {
  if (_client) return _client;

  const { llm } = getConfig();

  _client = new Anthropic({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrl,
  });

  return _client;
}

/**
 * Return the configured model identifier (e.g. "claude-sonnet-4-20250514").
 */
export function getModelName(): string {
  return getConfig().llm.model;
}

/**
 * Return the default maxTokens for LLM requests.
 */
export function getMaxTokens(): number {
  return getConfig().llm.maxTokens;
}

/**
 * Return the default temperature for LLM requests.
 */
export function getTemperature(): number {
  return getConfig().llm.temperature;
}
