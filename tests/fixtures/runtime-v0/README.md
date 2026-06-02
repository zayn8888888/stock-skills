# Runtime v0 Fixtures

This directory holds frozen fixtures from the pre-vNext runtime, used only for:

- **Migration tests** — validating the old-to-vNext importer mapping.
- **Regression snapshots** — proving key user behavior survived the rewrite.

These fixtures are **not imported by the app runtime**. They may contain old event names
(`text_delta`, `tool_call`, `run.updated`, etc.) and old DB shapes, which is expected.

The `check-no-runtime-debt` guard script allowslist this directory so that legacy patterns
here do not cause false-positive failures.
