-- Backfill existing rows after the vNext schema extension.
UPDATE sessions
SET title = name
WHERE title IS NULL AND name IS NOT NULL;
--> statement-breakpoint
UPDATE messages
SET updated_at = created_at
WHERE updated_at = '';
--> statement-breakpoint
UPDATE runs
SET status = CASE status
  WHEN 'pending' THEN 'queued'
  WHEN 'success' THEN 'succeeded'
  ELSE status
END
WHERE status IN ('pending', 'success');
--> statement-breakpoint
UPDATE runs
SET
  workflow_type = coalesce(
    workflow_type,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.workflow_type') END
  ),
  ticker = coalesce(
    ticker,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.ticker') END
  ),
  market = coalesce(
    market,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.market') END
  ),
  intent = coalesce(
    intent,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.intent') END
  ),
  execution_mode = coalesce(
    execution_mode,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.execution_mode') END
  ),
  caller = coalesce(
    caller,
    CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.caller') END
  ),
  metadata_json = coalesce(metadata_json, metadata);
--> statement-breakpoint
UPDATE artifacts
SET
  session_id = coalesce(
    session_id,
    (SELECT runs.session_id FROM runs WHERE runs.id = artifacts.run_id)
  ),
  inline_content = coalesce(inline_content, content),
  content_type = coalesce(content_type, mime_type);
