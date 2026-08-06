"""
Shape, codec and retention rules for draft version snapshots.

Invariant, relied on by both writers and the UI: version row `rev = N` holds the
draft content as it stood at draft revision N — that is, immediately *before* the
write that produced revision N+1. `source` names that superseding write, which is
why the panel reads a row as "before AI regeneration" rather than
"AI regeneration", and why restoring the newest `ai_regenerated` row undoes a
regeneration.

Bodies are gzipped JSON stored inline on the version item. Everything goes
through compress_body/decompress_body so the store can move to S3 later without
touching callers.
"""

import gzip
import json
from decimal import Decimal

CONTENT_KEYS = (
    "title",
    "status",
    "sections",
    "project_basics",
    "questionnaire",
    "additional_info",
    "uploaded_files",
)

# 400KB DynamoDB item limit less headroom for metadata.
MAX_BODY_BYTES = 380 * 1024

UNLABELED_TTL_SECONDS = 90 * 86400

MAX_UNLABELED_VERSIONS = 50


def draft_key(user_id, session_id):
    """Partition key for the version table."""
    return f"{user_id}#{session_id}"


def json_default(o):
    """json.dumps fallback for the types DynamoDB hands back."""
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    if isinstance(o, (set, frozenset)):
        return list(o)
    if isinstance(o, bytes):
        return o.decode("utf-8", "replace")
    if hasattr(o, "value"):  # boto3 Binary
        return None
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def snapshot_content(item):
    """Project a draft item down to the attributes we version."""
    return {key: item.get(key) for key in CONTENT_KEYS if item.get(key) is not None}


def is_content_change(old_image, new_image):
    """True when a change touched user work rather than only bookkeeping."""
    for key in CONTENT_KEYS:
        if json.dumps(old_image.get(key), sort_keys=True, default=json_default) != json.dumps(
            new_image.get(key), sort_keys=True, default=json_default
        ):
            return True
    return False


def changed_sections(old_sections, new_sections):
    """Section names whose text differs between two sections maps."""
    old_sections = old_sections or {}
    new_sections = new_sections or {}
    names = set(old_sections.keys()) | set(new_sections.keys())
    return sorted(n for n in names if old_sections.get(n) != new_sections.get(n))


def word_count(text):
    if not text or not isinstance(text, str):
        return 0
    return len(text.split())


def section_word_counts(sections):
    return {name: word_count(text) for name, text in (sections or {}).items()}


def compress_body(content):
    """gzip a snapshot body. Returns bytes ready for a DynamoDB Binary attribute."""
    raw = json.dumps(content, default=json_default, separators=(",", ":")).encode("utf-8")
    return gzip.compress(raw)


def decompress_body(blob):
    """Inverse of compress_body. Accepts bytes or a boto3 Binary."""
    raw = blob.value if hasattr(blob, "value") else blob
    return json.loads(gzip.decompress(bytes(raw)).decode("utf-8"))


def build_version_item(user_id, session_id, rev, content, created_at, source=None,
                       label=None, changed=None, ttl=None):
    """Assemble a version row, recording it as oversize rather than failing the
    write when the compressed body will not fit."""
    counts = section_word_counts(content.get("sections"))
    item = {
        "draft_key": draft_key(user_id, session_id),
        "rev": int(rev),
        "created_at": created_at,
        "changed_sections": changed or [],
        "section_word_counts": counts,
        "total_word_count": sum(counts.values()),
    }
    if source:
        item["source"] = source
    if label:
        item["label"] = label
    elif ttl is not None:
        item["ttl"] = int(ttl)

    body = compress_body(content)
    if len(body) > MAX_BODY_BYTES:
        item["oversize"] = True
        item["body_bytes"] = len(body)
    else:
        item["body_gz"] = body
        item["body_bytes"] = len(body)

    return item
