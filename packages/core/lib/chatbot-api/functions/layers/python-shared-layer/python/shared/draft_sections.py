"""
Narrative section identity for applications; the id rules mirror grantwell-shared/sections.mjs.

An application keys its section text by section id and stores `section_order` ([{id, name}])
beside it. A row from before ids existed has no `section_order` and is keyed by name; it is read
through normalize() and converts the next time it is written.
"""

import re
import unicodedata

MAX_SLUG_LENGTH = 64


def section_slug(name):
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:MAX_SLUG_LENGTH].rstrip("-")
    return slug or "section"


def unique_section_id(base, used):
    candidate, n = base, 2
    while candidate in used:
        candidate = f"{base}-{n}"
        n += 1
    used.add(candidate)
    return candidate


def _refs(order):
    if not isinstance(order, list):
        return []
    return [
        {"id": ref["id"], "name": ref.get("name") if isinstance(ref.get("name"), str) else ref["id"]}
        for ref in order
        if isinstance(ref, dict) and isinstance(ref.get("id"), str)
    ]


def merge_orders(first, second):
    """`first` then the refs of `second` it lacks."""
    seen, out = set(), []
    for ref in [*_refs(first), *_refs(second)]:
        if ref["id"] in seen:
            continue
        seen.add(ref["id"])
        out.append(ref)
    return out


def is_keyed_by_id(item):
    return isinstance((item or {}).get("section_order"), list)


def normalize(sections, section_order=None, known=None):
    """(sections by id, order). `known` ([{id, name}]) maps a name-keyed row's names to ids."""
    text = sections if isinstance(sections, dict) else {}
    known_refs = _refs(known)

    if isinstance(section_order, list):
        return dict(text), merge_orders(_refs(section_order), known_refs)

    by_name, by_slug = {}, {}
    for ref in known_refs:
        by_name.setdefault(ref["name"], ref["id"])
        by_slug.setdefault(section_slug(ref["name"]), ref["id"])

    used, converted, extras = set(), {}, []
    reserved = {ref["id"] for ref in known_refs}
    for name, value in text.items():
        section_id = name if name in reserved else by_name.get(name)
        if not section_id or section_id in used:
            section_id = by_slug.get(section_slug(name))
        if not section_id or section_id in used:
            section_id = unique_section_id(section_slug(name), used | reserved)
            extras.append({"id": section_id, "name": name})
        used.add(section_id)
        converted[section_id] = value
    return converted, merge_orders(known_refs, extras)


def normalize_item(item, known=None):
    """normalize() for a draft row or snapshot dict."""
    item = item or {}
    return normalize(item.get("sections"), item.get("section_order"), known)


def resolve_ids(keys, order):
    """Ids for `keys`, each either an id in `order` or a section name."""
    refs = _refs(order)
    ids = {ref["id"] for ref in refs}
    by_name = {}
    for ref in refs:
        by_name.setdefault(ref["name"], ref["id"])
    out = []
    for key in keys or []:
        if key in ids:
            out.append(key)
        elif key in by_name:
            out.append(by_name[key])
        else:
            out.append(key)
    return out
