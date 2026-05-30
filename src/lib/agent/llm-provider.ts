import { getConfig } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getLLMClient(): Anthropic {
  if (_client) return _client;
  const config = getConfig();
  _client = new Anthropic({
    apiKey: config.anthropicApiKey,
    baseURL: config.anthropicBaseUrl,
  });
  return _client;
}

export function getModelName(): string {
  return getConfig().llmModel;
}

/** Check if the Anthropic API key is configured. */
export function isApiKeyConfigured(): boolean {
  const key = getConfig().anthropicApiKey;
  return key.length > 0;
}
