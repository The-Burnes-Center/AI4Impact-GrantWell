"""
DynamoDB Stream consumer for the draft table: turns every content change into a
version snapshot.

Snapshots the NewImage — the state each write produced — so the row a user picks
in the panel is literally the content they will get back. A stream record cannot
identify its author, so writers stamp `last_write_source` on the draft row and
this reads it from the NewImage.

Capture is server-side rather than client-side because there are many client
write paths plus a server-side writer (draft-pipeline/assemble), and the
AI-generated writes — the ones most in need of a baseline — never pass through
the browser.
"""

import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer

from shared import draft_versions as dv

DRAFT_VERSION_TABLE_NAME = os.environ["DRAFT_VERSION_TABLE_NAME"]
SNAPSHOT_MIN_INTERVAL_SECONDS = int(os.environ.get("SNAPSHOT_MIN_INTERVAL_SECONDS", "300"))

dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
table = dynamodb.Table(DRAFT_VERSION_TABLE_NAME)

_deserializer = TypeDeserializer()


def _plain(image):
    if not image:
        return {}
    return {key: _deserializer.deserialize(value) for key, value in image.items()}


def _record_timestamp(record):
    approximate = (record.get("dynamodb") or {}).get("ApproximateCreationDateTime")
    if approximate:
        try:
            return datetime.fromtimestamp(float(approximate), tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OSError):
            pass
    return datetime.now(timezone.utc).isoformat()


def _newest_version(draft_key):
    response = table.query(
        KeyConditionExpression=Key("draft_key").eq(draft_key),
        ProjectionExpression="#r, created_at, #src, #lbl, changed_sections",
        ExpressionAttributeNames={"#r": "rev", "#src": "source", "#lbl": "label"},
        ScanIndexForward=False,
        Limit=1,
    )
    items = response.get("Items", [])
    return items[0] if items else None


def _supersedes(draft_key, source, changed, created_at):
    """One editing episode should leave one row, holding its latest text.

    Returns the rev of a row this snapshot replaces, or None to just append.
    Only consecutive autosaves of the *same* section set collapse, and within the
    window — so moving to another section always starts a new version.
    """
    if source != "autosave":
        return None

    newest = _newest_version(draft_key)
    if not newest or newest.get("source") != "autosave" or newest.get("label"):
        return None
    if sorted(newest.get("changed_sections") or []) != sorted(changed or []):
        return None

    try:
        previous = datetime.fromisoformat(str(newest["created_at"]))
        current = datetime.fromisoformat(created_at)
    except (KeyError, TypeError, ValueError):
        return None

    if previous.tzinfo is None:
        previous = previous.replace(tzinfo=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    if (current - previous).total_seconds() >= SNAPSHOT_MIN_INTERVAL_SECONDS:
        return None
    return newest.get("rev")


def _prune(draft_key):
    response = table.query(
        KeyConditionExpression=Key("draft_key").eq(draft_key),
        ProjectionExpression="#r, #lbl",
        ExpressionAttributeNames={"#r": "rev", "#lbl": "label"},
        ScanIndexForward=False,
    )
    unlabeled = [item for item in response.get("Items", []) if not item.get("label")]
    excess = unlabeled[dv.MAX_UNLABELED_VERSIONS:]
    if not excess:
        return
    with table.batch_writer() as batch:
        for item in excess:
            batch.delete_item(Key={"draft_key": draft_key, "rev": item["rev"]})


def process(record):
    event_name = record.get("eventName")
    if event_name not in ("INSERT", "MODIFY"):
        return

    stream = record.get("dynamodb") or {}
    old_image = _plain(stream.get("OldImage"))
    new_image = _plain(stream.get("NewImage"))
    if not new_image:
        return

    # INSERT is the blank draft, which is worth a row of its own: it is the
    # "before anything was written" point users restore to.
    if event_name == "MODIFY":
        if not old_image or not dv.is_content_change(old_image, new_image):
            return

    user_id = new_image.get("user_id") or old_image.get("user_id")
    session_id = new_image.get("session_id") or old_image.get("session_id")
    if not user_id or not session_id:
        return

    draft_key = dv.draft_key(user_id, session_id)
    rev = int(new_image.get("rev") or 0)
    if event_name == "INSERT":
        source = "initial"
    else:
        source = new_image.get("last_write_source") or "autosave"
    created_at = _record_timestamp(record)
    changed = dv.changed_sections(old_image.get("sections"), new_image.get("sections"))

    superseded = _supersedes(draft_key, source, changed, created_at)

    item = dv.build_version_item(
        user_id=user_id,
        session_id=session_id,
        rev=rev,
        content=dv.snapshot_content(new_image),
        created_at=created_at,
        source=source,
        changed=changed,
        ttl=int(datetime.now(timezone.utc).timestamp()) + dv.UNLABELED_TTL_SECONDS,
    )

    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(#r)",
            ExpressionAttributeNames={"#r": "rev"},
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return
        raise

    # Written before deleting, so a failure here leaves a spare row rather than
    # a hole in the history.
    if superseded is not None and int(superseded) != rev:
        try:
            table.delete_item(Key={"draft_key": draft_key, "rev": int(superseded)})
        except ClientError as error:
            print(f"Could not collapse superseded version {superseded}: {error}")

    _prune(draft_key)


def lambda_handler(event, context):
    failures = []
    for record in event.get("Records", []):
        try:
            process(record)
        except Exception as error:  # noqa: BLE001 - one bad record must not block the shard
            print(f"draft-version-writer failed on {record.get('eventID')}: {error}")
            failures.append({"itemIdentifier": record.get("eventID")})
    return {"batchItemFailures": failures}
