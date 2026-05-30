import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export interface Config {
  analysisRoot: string;
  dbPath: string;
  token: string;
  maxUploadBytes: number;
  anthropicApiKey: string;
  anthropicBaseUrl?: string;
  llmModel: string;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const analysisRoot = process.env.STOCK_SKILLS_ANALYSIS_ROOT
    ?? path.resolve(process.cwd(), "analysis");
  const dbPath = path.resolve(analysisRoot, "stock_skills.sqlite");

  if (!existsSync(analysisRoot)) {
    mkdirSync(analysisRoot, { recursive: true });
  }
  const token = loadOrCreateToken(analysisRoot);

  const artifactsDir = path.resolve(analysisRoot, "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  _config = {
    analysisRoot,
    dbPath,
    token,
    maxUploadBytes: 50 * 1024 * 1024,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    llmModel:
      process.env.MODEL_ID ??
      process.env.LLM_MODEL ??
      "claude-sonnet-4-20250514",
  };
  return _config;
}

function loadOrCreateToken(analysisRoot: string): string {
  const envToken = process.env.STOCK_SKILLS_TOKEN;
  if (envToken) return envToken;

  const tokenFile = path.resolve(analysisRoot, ".token");
  if (existsSync(tokenFile)) {
    return readFileSync(tokenFile, "utf-8").trim();
  }

  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenFile, token, "utf-8");
  return token;
}
