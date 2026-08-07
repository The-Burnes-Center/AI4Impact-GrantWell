"""
DynamoDB Stream consumer for the draft table: turns every content change into a
version snapshot.

Snapshots the OldImage — the state before the change — which is what a restore
needs and makes "the text before the AI rewrote it" fall out for free. A stream
record cannot identify its author, so writers stamp `last_write_source` on the
draft row and this reads it from the NewImage.

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
        ProjectionExpression="#r, created_at, #src, #lbl",
        ExpressionAttributeNames={"#r": "rev", "#src": "source", "#lbl": "label"},
        ScanIndexForward=False,
        Limit=1,
    )
    items = response.get("Items", [])
    return items[0] if items else None


def _should_coalesce(draft_key, source, created_at):
    """Consecutive autosaves collapse into one per interval; every other source
    always appends."""
    if source != "autosave":
        return False

    newest = _newest_version(draft_key)
    if not newest or newest.get("source") != "autosave" or newest.get("label"):
        return False

    try:
        previous = datetime.fromisoformat(str(newest["created_at"]))
        current = datetime.fromisoformat(created_at)
    except (KeyError, TypeError, ValueError):
        return False

    if previous.tzinfo is None:
        previous = previous.replace(tzinfo=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    return (current - previous).total_seconds() < SNAPSHOT_MIN_INTERVAL_SECONDS


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
    if record.get("eventName") != "MODIFY":
        return

    stream = record.get("dynamodb") or {}
    old_image = _plain(stream.get("OldImage"))
    new_image = _plain(stream.get("NewImage"))
    if not old_image or not new_image:
        return

    if not dv.is_content_change(old_image, new_image):
        return

    user_id = old_image.get("user_id") or new_image.get("user_id")
    session_id = old_image.get("session_id") or new_image.get("session_id")
    if not user_id or not session_id:
        return

    draft_key = dv.draft_key(user_id, session_id)
    rev = int(old_image.get("rev") or 0)
    source = new_image.get("last_write_source") or "autosave"
    created_at = _record_timestamp(record)

    if _should_coalesce(draft_key, source, created_at):
        return

    item = dv.build_version_item(
        user_id=user_id,
        session_id=session_id,
        rev=rev,
        content=dv.snapshot_content(old_image),
        created_at=created_at,
        source=source,
        changed=dv.changed_sections(old_image.get("sections"), new_image.get("sections")),
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
