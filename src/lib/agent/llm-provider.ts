import { getConfig } from "@/lib/config";

/**
 * Get the base URL for the LLM API endpoint.
 *
 * Pi uses this to construct a custom Model object that points to
 * the correct endpoint (e.g. Xiaomi Token Plan proxy).
 */
export function getBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
}

/**
 * Get the model identifier for the current configuration.
 */
export function getModelName(): string {
  return getConfig().llmModel;
}

/** Get the context window size (total input+output token limit). */
export function getContextWindow(): number {
  return getConfig().contextWindow;
}

/** Get the max output tokens per single LLM response. */
export function getMaxTokens(): number {
  return getConfig().maxTokens;
}

/**
 * Check if the API key is configured.
 *
 * Pi reads `ANTHROPIC_API_KEY` from process.env automatically.
 * This function is used for pre-flight validation before starting a run.
 */
export function isApiKeyConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  return key.length > 0;
}
