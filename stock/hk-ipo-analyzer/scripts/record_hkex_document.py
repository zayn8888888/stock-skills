#!/usr/bin/env python3
"""Record normalized HKEX IPO document metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


DOC_TYPES = {
    "APPLICATION_PROOF",
    "PHIP",
    "OC_ANNOUNCEMENT",
    "PROSPECTUS",
    "ALLOTMENT_RESULT",
    "LISTING_ANNOUNCEMENT",
}


def is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    return digest.hexdigest(), size


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize HKEX IPO document metadata for reports."
    )
    parser.add_argument("--company", required=True, help="Company name.")
    parser.add_argument("--stock-code", default="", help="HK stock code if available.")
    parser.add_argument("--doc-type", required=True, choices=sorted(DOC_TYPES))
    parser.add_argument("--title", required=True, help="Document title.")
    parser.add_argument("--pdf-url", required=True, help="Official PDF URL.")
    parser.add_argument("--source-page-url", required=True, help="Page where the PDF link was found.")
    parser.add_argument("--release-time", default="", help="Release time shown by HKEX, if known.")
    parser.add_argument("--retrieved-at", default="", help="ISO timestamp; defaults to current UTC time.")
    parser.add_argument("--local-file", default="", help="Downloaded PDF path for sha256 calculation.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not is_http_url(args.pdf_url):
        raise SystemExit("--pdf-url must be an http(s) URL")
    if not is_http_url(args.source_page_url):
        raise SystemExit("--source-page-url must be an http(s) URL")

    sha256 = None
    size_bytes = None
    local_file = args.local_file or None
    if local_file:
        path = Path(local_file).expanduser()
        if not path.is_file():
            raise SystemExit(f"--local-file not found: {path}")
        sha256, size_bytes = sha256_file(path)
        local_file = str(path)

    retrieved_at = args.retrieved_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    record = {
        "company": args.company,
        "stock_code": args.stock_code or None,
        "doc_type": args.doc_type,
        "title": args.title,
        "pdf_url": args.pdf_url,
        "source_page_url": args.source_page_url,
        "release_time": args.release_time or None,
        "retrieved_at": retrieved_at,
        "local_file": local_file,
        "sha256": sha256,
        "size_bytes": size_bytes,
    }
    print(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
