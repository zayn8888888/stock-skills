import { type TSchema, Type } from "typebox";

// ──────────────────── JSON Schema subset types ─────────────────────

interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, JsonSchemaProperty>;
  additionalProperties?: boolean;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

// ──────────────────── converter ────────────────────────────────────

/**
 * Convert a single JSON Schema property definition to a TypeBox schema.
 *
 * Handles the subset used by capability tools and system tools:
 * - string (with optional enum)
 * - number
 * - boolean
 * - object (with additionalProperties)
 */
function convertProperty(prop: JsonSchemaProperty): TSchema {
  switch (prop.type) {
    case "string":
      if (prop.enum && prop.enum.length > 0) {
        return Type.Union(prop.enum.map((v) => Type.Literal(v)));
      }
      return Type.String();

    case "number":
      return Type.Number();

    case "boolean":
      return Type.Boolean();

    case "object": {
      if (prop.properties) {
        // Nested object with its own properties
        return convertSchema({
          type: "object",
          properties: prop.properties,
          additionalProperties: prop.additionalProperties,
        });
      }
      // Free-form object (e.g. params: { additionalProperties: true })
      return Type.Record(Type.String(), Type.Any());
    }

    default:
      // Unknown type → permissive any
      console.warn(`[schema-bridge] Unknown JSON Schema type "${prop.type}", falling back to Any`);
      return Type.Any();
  }
}

/**
 * Convert a JSON Schema object (the subset used in this project) to a
 * TypeBox TSchema suitable for Pi's AgentTool.parameters.
 *
 * Input examples come from:
 * - Static tool definitions in tools.ts (write_artifact, update_goal_evidence)
 * - Dynamic capability tools built from DB-stored paramsSchema
 * - buildDefaultInputSchema() fallback
 */
export function convertSchema(schema: JsonSchema): TSchema {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const tbProperties: Record<string, TSchema> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const converted = convertProperty(prop);
    tbProperties[key] = required.has(key) ? converted : Type.Optional(converted);
  }

  return Type.Object(tbProperties, {
    additionalProperties: schema.additionalProperties ?? false,
  });
}
