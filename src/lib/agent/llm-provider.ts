import { getConfig } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getLLMClient(): Anthropic {
  if (_client) return _client;
  const config = getConfig();
  _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
}

export function getModelName(): string {
  return getConfig().llmModel;
}
