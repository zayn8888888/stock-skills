const WORKFLOW_SKILL_MAP: Record<string, string> = {
  analyze: "stock-analyzer",
  debate: "trading-debate",
  scan: "market-scanner",
  review: "portfolio-review",
};

const TICKER_STOPWORDS = new Set([
  "API",
  "CSV",
  "HTTP",
  "HTTPS",
  "JSON",
  "LLM",
  "OK",
  "SSE",
  "SQL",
  "UI",
]);

export interface MessageContextInput {
  ticker?: string;
  workflow?: string;
  workflowKey?: string;
}

export function inferTicker(content: string): string | undefined {
  const matches = content.match(/\b[A-Z][A-Z0-9.]{0,5}\b/g) ?? [];
  return matches.find((token) => !TICKER_STOPWORDS.has(token));
}

export function buildMessageContext(content: string, ctx?: MessageContextInput) {
  const ticker = ctx?.ticker ?? inferTicker(content);
  const workflowType = ctx?.workflow;
  const workflowKey = ctx?.workflowKey;
  const skillName = workflowKey
    ? (WORKFLOW_SKILL_MAP[workflowKey] ?? "stock-analyzer")
    : "stock-analyzer";

  return {
    ticker,
    skill_name: skillName,
    workflow_type: workflowType,
  };
}
