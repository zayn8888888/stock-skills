import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────── types ──────────────────────────────

export interface AgentConfig {
  name: string;
  displayName: string;
  workflowType: string;
  skills: string[];
  requiredArtifacts: string[];
  optionalArtifacts?: string[];
  dataSources?: string[];
  [key: string]: unknown;
}

export interface LoadedAgent {
  name: string;
  displayName: string;
  workflowType: string;
  skills: string[];
  requiredArtifacts: string[];
  optionalArtifacts: string[];
  dataSources: string[];
  prompt: string;
  contract: Record<string, unknown>;
}

// ──────────────────────── YAML parser ────────────────────────────

/**
 * Minimal YAML parser that handles the flat key/value + list structure
 * used by agent.yaml files. Supports:
 *   - plain scalars (strings, numbers, booleans, null)
 *   - quoted scalars (single and double)
 *   - top-level lists (indented "- item" blocks)
 *
 * Does NOT handle nested objects, multi-line strings, anchors, or
 * other advanced YAML features -- those are unnecessary for the
 * agent config format.
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    i++;

    // Skip blank lines and comments
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;

    const match = raw.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
    if (!match) continue;

    const key = match[1];
    const inlineValue = match[2].trim();

    if (inlineValue) {
      // Scalar value on the same line as the key
      result[key] = parseScalar(inlineValue);
    } else {
      // Look ahead for an indented list block
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (/^\s*$/.test(next) || /^\s*#/.test(next)) {
          i++;
          continue;
        }
        const itemMatch = next.match(/^\s+-\s+(.*)/);
        if (itemMatch) {
          items.push(parseScalar(itemMatch[1].trim()) as string);
          i++;
        } else {
          break;
        }
      }
      result[key] = items;
    }
  }

  return result;
}

function parseScalar(value: string): unknown {
  // Quoted strings
  const dq = value.match(/^"(.*)"$/);
  if (dq) return dq[1];
  const sq = value.match(/^'(.*)'$/);
  if (sq) return sq[1];

  // Array literal (inline) -- unlikely in agent.yaml but handle gracefully
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => parseScalar(s.trim()));
  }

  // Boolean
  if (/^(true|yes)$/i.test(value)) return true;
  if (/^(false|no)$/i.test(value)) return false;

  // Null
  if (/^(null|~)$/i.test(value)) return null;

  // Number
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;

  return value;
}

// ──────────────────────── path helpers ───────────────────────────

const AGENTS_ROOT = resolve(process.cwd(), "skills", "agents");
const SKILLS_ROOT = resolve(process.cwd(), "skills");

function agentDir(name: string): string {
  return resolve(AGENTS_ROOT, name);
}

// ── Load referenced skill prompts ───────────────────────────────

/**
 * Load all SKILL.md files referenced by the agent's `skills` array.
 * Each skill path is relative to the project root (e.g. "skills/stock/stock-analyzer").
 * Returns the concatenated content.
 */
function loadSkillPrompts(skillPaths: string[]): string {
  const parts: string[] = [];
  for (const skillPath of skillPaths) {
    const skillDir = resolve(process.cwd(), skillPath);
    const skillFile = resolve(skillDir, "SKILL.md");
    if (existsSync(skillFile)) {
      parts.push(readFileSync(skillFile, "utf-8"));
    }
    // Also load reference files
    const refsDir = resolve(skillDir, "references");
    if (existsSync(refsDir)) {
      for (const ref of readdirSync(refsDir).filter((f) => f.endsWith(".md"))) {
        parts.push(readFileSync(resolve(refsDir, ref), "utf-8"));
      }
    }
  }
  return parts.join("\n\n---\n\n");
}

// ──────────────────────── cache ──────────────────────────────────

const _cache = new Map<string, LoadedAgent>();

// ──────────────────────── public API ─────────────────────────────

/**
 * Load an agent definition from skills/agents/{name}/.
 *
 * Reads and caches three files:
 *   - agent.yaml        → config metadata
 *   - prompt.md         → system / role prompt
 *   - output-contract.json → JSON Schema for structured output
 *
 * Results are cached after the first successful load.
 */
export function loadAgent(name: string): LoadedAgent {
  const cached = _cache.get(name);
  if (cached) return cached;

  const dir = agentDir(name);

  // ── agent.yaml ──
  const yamlPath = resolve(dir, "agent.yaml");
  if (!existsSync(yamlPath)) {
    throw new Error(`Agent config not found: ${yamlPath}`);
  }
  const raw = readFileSync(yamlPath, "utf-8");
  const config = parseSimpleYaml(raw) as Record<string, unknown>;

  // ── prompt.md ──
  const promptPath = resolve(dir, "prompt.md");
  if (!existsSync(promptPath)) {
    throw new Error(`Agent prompt not found: ${promptPath}`);
  }
  const prompt = readFileSync(promptPath, "utf-8");

  // ── output-contract.json ──
  const contractPath = resolve(dir, "output-contract.json");
  if (!existsSync(contractPath)) {
    throw new Error(`Agent output contract not found: ${contractPath}`);
  }
  const contract = JSON.parse(readFileSync(contractPath, "utf-8")) as Record<string, unknown>;

  // ── assemble ──
  const skills = (config.skills as string[]) ?? [];
  const skillPrompts = loadSkillPrompts(skills);
  const fullPrompt = skillPrompts
    ? `${prompt}\n\n---\n\n# Referenced Skill Knowledge\n\n${skillPrompts}`
    : prompt;

  const agent: LoadedAgent = {
    name: (config.name as string) ?? name,
    displayName: (config.display_name as string) ?? name,
    workflowType: (config.workflow_type as string) ?? "unknown",
    skills,
    requiredArtifacts: (config.required_artifacts as string[]) ?? [],
    optionalArtifacts: (config.optional_artifacts as string[]) ?? [],
    dataSources: (config.data_sources as string[]) ?? [],
    prompt: fullPrompt,
    contract,
  };

  _cache.set(name, agent);
  return agent;
}

/**
 * Return the list of available agent names by scanning skills/agents/.
 */
export function listAgents(): string[] {
  if (!existsSync(AGENTS_ROOT)) return [];
  return readdirSync(AGENTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
