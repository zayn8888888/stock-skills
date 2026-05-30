-- Data Source Architecture v2
-- Replaces the old data_sources table with a structured provider/capability/route model.

-- Providers: the horizontal axis (data vendors)
CREATE TABLE IF NOT EXISTS data_providers (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  adapter_id       TEXT NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,
  connection_config TEXT,
  status           TEXT NOT NULL DEFAULT 'unknown',
  last_check_at    TEXT,
  last_error       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Capabilities: the vertical axis (data types)
CREATE TABLE IF NOT EXISTS data_capabilities (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  category        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  params_schema   TEXT,
  response_schema TEXT,
  created_at      TEXT NOT NULL
);

-- Routes: the matrix (provider × capability × market)
CREATE TABLE IF NOT EXISTS data_source_routes (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES data_providers(id),
  capability_id TEXT NOT NULL REFERENCES data_capabilities(id),
  markets       TEXT NOT NULL DEFAULT '["*"]',
  priority      INTEGER NOT NULL DEFAULT 1,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_provider_cap
  ON data_source_routes(provider_id, capability_id);

-- Drop the old table
DROP TABLE IF EXISTS data_sources;

-- Seed data is managed by src/lib/data-source/seed.ts (reads from JSON manifests)
