/**
 * Application configuration — singleton loaded once from environment variables.
 */

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
}

export interface AppConfig {
  /** Absolute path to the analysis output root (e.g. ./analysis) */
  analysisRoot: string;
  /** Bearer token for API authentication */
  token: string;
  /** LLM provider configuration */
  llm: LLMConfig;
  /** SQLite database file path */
  dbPath: string;
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const analysisRoot = process.env.ANALYSIS_ROOT ?? "./analysis";
  const token = process.env.ANA_TOKEN ?? "";
  const dbPath = process.env.DB_PATH ?? "./data/stock.db";

  _config = {
    analysisRoot,
    token,
    dbPath,
    llm: {
      apiKey: process.env.LLM_API_KEY ?? "",
      model: process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.anthropic.com",
      temperature: Number.parseFloat(process.env.LLM_TEMPERATURE ?? "0.3"),
      maxTokens: Number.parseInt(process.env.LLM_MAX_TOKENS ?? "4096", 10),
    },
  };

  return _config;
}
