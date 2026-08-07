"""
This Lambda function handles draft management for the draft editor application.
It supports creating, retrieving, updating, and deleting drafts stored in a DynamoDB table.
The function also lists drafts by user ID and deletes all drafts for a user.
"""

import os
import uuid
import boto3
from botocore.exceptions import ClientError
import json
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from pydantic import ValidationError
from shared.models import DraftOperationRequest, parse_lambda_event_body
from shared import draft_versions as dv

# Retrieve DynamoDB table name from environment variables
DDB_TABLE_NAME = os.environ["DRAFT_TABLE_NAME"]

# Initialize a DynamoDB resource using boto3 with a specific AWS region
dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
# Connect to the specified DynamoDB table
table = dynamodb.Table(DDB_TABLE_NAME)

DRAFT_VERSION_TABLE_NAME = os.environ.get("DRAFT_VERSION_TABLE_NAME")
_version_table = dynamodb.Table(DRAFT_VERSION_TABLE_NAME) if DRAFT_VERSION_TABLE_NAME else None


def _now_iso():
    """ISO-8601 UTC. last_modified is the LastModifiedIndex sort key, so it has
    to sort lexicographically against the ISO values clients send."""
    return datetime.now(timezone.utc).isoformat()


def _dumps(payload):
    """json.dumps that survives the Decimal/Binary values DynamoDB returns."""
    return json.dumps(payload, default=dv.json_default)


def _json_response(status_code, payload, extra=None):
    body = {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': _dumps(payload)
    }
    if extra:
        body.update(extra)
    return body

# Analytics tracking (mirrors grantwell-shared recordEvent in JS; see functions/analytics).
# Best-effort: any failure is swallowed so tracking never breaks a draft operation.
ANALYTICS_TABLE_NAME = os.environ.get("ANALYTICS_TABLE_NAME")
ANALYTICS_EVENT_TTL_SECONDS = 400 * 86400
_analytics_table = dynamodb.Table(ANALYTICS_TABLE_NAME) if ANALYTICS_TABLE_NAME else None


def record_event(event_type, user_id, state=None, nofo_name=None):
    if not _analytics_table or not user_id:
        return
    try:
        now = datetime.now(timezone.utc)
        iso = now.isoformat()
        item = {
            "pk": f"USER#{user_id}",
            "sk": f"EVT#{iso}#{uuid.uuid4()}",
            "event_type": event_type,
            "event_day": iso[:10],
            "event_sk": f"{event_type}#{iso}",
            "created_at": iso,
            "ttl": int(now.timestamp()) + ANALYTICS_EVENT_TTL_SECONDS,
        }
        if state:
            item["state"] = state.strip().upper()
        if nofo_name:
            item["nofo_name"] = str(nofo_name)
        _analytics_table.put_item(Item=item)
    except Exception as e:  # noqa: BLE001 - tracking must never fail the caller
        print(f"record_event failed (non-fatal): {e}")

# Define a function to add a draft or update an existing one in the DynamoDB table
def add_draft(session_id, user_id, sections, title, document_identifier, project_basics=None, questionnaire=None, last_modified=None, status=None, additional_info=None, uploaded_files=None, last_write_source=None):
    try:
        # Determine default status based on what data exists
        if status is None:
            if document_identifier and not project_basics:
                status = "project_basics"
            elif project_basics and not sections:
                status = "questionnaire"
            elif sections:
                status = "editing_sections"
            else:
                status = "project_basics"

        # Create a new item in DynamoDB
        item = {
            "user_id": user_id,
            "session_id": session_id,
            "title": title.strip() if title else "",
            "document_identifier": document_identifier,
            "sections": sections or {},
            "project_basics": project_basics or {},
            "questionnaire": questionnaire or {},
            "additional_info": additional_info or "",
            "uploaded_files": uploaded_files or [],
            "last_modified": last_modified or _now_iso(),
            "status": status,
            "rev": 1,
            "last_write_source": last_write_source or "manual"
        }

        # Put the item in DynamoDB
        table.put_item(Item=item)

        # Return only the fields we project in queries
        response_item = {
            "sessionId": session_id,
            "title": item["title"],
            "documentIdentifier": item["document_identifier"],
            "lastModified": item["last_modified"],
            "status": item["status"],
            "rev": item["rev"]
        }

        return _json_response(200, response_item)
    except ClientError as error:
        print("Caught error: DynamoDB error - could not add draft")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'error': str(error),
            'body': 'Failed to add the draft due to a database error.'
        }
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not add draft")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'error': str(general_error),
            'body': 'An unexpected error occurred while adding the draft.'
        }

# A function to retrieve a draft from DynamoDB based on session_id and user_id
def get_draft(session_id, user_id):
    # Initialize a variable to hold the response from DynamoDB
    response = {}
    try:
        # Attempt to retrieve an item using the session_id and user_id as keys
        response = table.get_item(Key={"user_id": user_id, "session_id": session_id})
    except ClientError as error:
        print("Caught error: DynamoDB error - could not get draft")
        # Handle specific error when the specified resource is not found in DynamoDB
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            # Return a 404 Not Found status code and message when the item is not found
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},  # Allow all domains for CORS
                'body': json.dumps(f"No record found with session id: {session_id}")
            }
        else:
            # Return a 500 Internal Server Error status for all other DynamoDB errors
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},  # Allow all domains for CORS
                'body': json.dumps('An unexpected error occurred')
            }

    # Prepare the response to the client with a 200 OK status if the item is successfully retrieved
    # Return the prepared response to the client
    return _json_response(200, response.get("Item", {}))

# Define a function to update a draft in the DynamoDB table
def update_draft(session_id, user_id, sections=None, title=None, document_identifier=None, project_basics=None, questionnaire=None, last_modified=None, status=None, additional_info=None, uploaded_files=None, expected_rev=None, last_write_source=None):
    try:
        # Prepare update expression and attribute values
        update_parts = []
        expression_values = {}
        expression_names = {}

        if sections is not None:
            update_parts.append("#sec = :sections")
            expression_values[":sections"] = sections
            expression_names["#sec"] = "sections"
            
        if title is not None:
            update_parts.append("#ttl = :title")
            expression_values[":title"] = title.strip() if title else ""
            expression_names["#ttl"] = "title"
            
        if document_identifier is not None:
            update_parts.append("#doc = :doc_id")
            expression_values[":doc_id"] = document_identifier
            expression_names["#doc"] = "document_identifier"
            
        if project_basics is not None:
            update_parts.append("#pb = :project_basics")
            expression_values[":project_basics"] = project_basics
            expression_names["#pb"] = "project_basics"
            
        if questionnaire is not None:
            update_parts.append("#q = :questionnaire")
            expression_values[":questionnaire"] = questionnaire
            expression_names["#q"] = "questionnaire"

        if additional_info is not None:
            update_parts.append("#ai = :additional_info")
            expression_values[":additional_info"] = additional_info
            expression_names["#ai"] = "additional_info"

        if uploaded_files is not None:
            update_parts.append("#uf = :uploaded_files")
            expression_values[":uploaded_files"] = uploaded_files
            expression_names["#uf"] = "uploaded_files"

        if last_write_source is not None:
            update_parts.append("#lws = :last_write_source")
            expression_values[":last_write_source"] = last_write_source
            expression_names["#lws"] = "last_write_source"

        if status is not None:
            update_parts.append("#st = :status")
            expression_values[":status"] = status
            expression_names["#st"] = "status"
        else:
            # Auto-update status based on content if not explicitly provided
            # Get current draft to check existing state
            try:
                current_response = table.get_item(Key={"user_id": user_id, "session_id": session_id})
                current_item = current_response.get("Item", {})
                current_sections = sections if sections is not None else current_item.get("sections", {})
                current_project_basics = project_basics if project_basics is not None else current_item.get("project_basics", {})
                current_doc_id = document_identifier if document_identifier is not None else current_item.get("document_identifier")
                
                # Determine status based on content
                if current_doc_id and not current_project_basics:
                    auto_status = "project_basics"
                elif current_project_basics and not current_sections:
                    auto_status = "questionnaire"
                elif current_sections:
                    auto_status = "editing_sections"
                else:
                    auto_status = current_item.get("status", "project_basics")
                
                update_parts.append("#st = :status")
                expression_values[":status"] = auto_status
                expression_names["#st"] = "status"
            except:
                # If we can't get current item, default to project_basics
                update_parts.append("#st = :status")
                expression_values[":status"] = "project_basics"
                expression_names["#st"] = "status"
            
        # Always update last_modified
        update_parts.append("#lm = :last_modified")
        expression_values[":last_modified"] = last_modified or _now_iso()
        expression_names["#lm"] = "last_modified"

        # if_not_exists covers rows written before rev existed.
        update_parts.append("#rev = if_not_exists(#rev, :rev_zero) + :rev_one")
        expression_values[":rev_zero"] = 0
        expression_values[":rev_one"] = 1
        expression_names["#rev"] = "rev"

        update_kwargs = {}
        if expected_rev is not None:
            update_kwargs["ConditionExpression"] = "attribute_not_exists(#rev) OR #rev = :expected_rev"
            expression_values[":expected_rev"] = expected_rev

        # Update the item in DynamoDB
        response = table.update_item(
            Key={"user_id": user_id, "session_id": session_id},
            UpdateExpression="set " + ", ".join(update_parts),
            ExpressionAttributeValues=expression_values,
            ExpressionAttributeNames=expression_names,
            ReturnValues="ALL_NEW",
            **update_kwargs
        )

        # Return the complete updated item
        updated_item = response.get("Attributes", {})
        response_item = {
            "sessionId": session_id,
            "userId": user_id,
            "title": updated_item.get("title", ""),
            "documentIdentifier": updated_item.get("document_identifier", ""),
            "sections": updated_item.get("sections", {}),
            "projectBasics": updated_item.get("project_basics", {}),
            "questionnaire": updated_item.get("questionnaire", {}),
            "additionalInfo": updated_item.get("additional_info", ""),
            "uploadedFiles": updated_item.get("uploaded_files", []),
            "lastModified": updated_item.get("last_modified", ""),
            "status": updated_item.get("status", "project_basics"),
            "rev": updated_item.get("rev")
        }

        return _json_response(200, response_item)
    except ClientError as error:
        print("Caught error: DynamoDB error - could not update draft")
        # Return a structured error message and status code
        error_code = error.response['Error']['Code']
        if error_code == "ConditionalCheckFailedException":
            current = {}
            try:
                current = table.get_item(Key={"user_id": user_id, "session_id": session_id}).get("Item", {})
            except ClientError as read_error:
                print(f"Conflict read-back failed: {read_error}")
            return _json_response(409, {
                'error': 'conflict',
                'message': 'Draft was modified elsewhere',
                'current': current
            })
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'error': str(error),
                'body': f"No record found with session id: {session_id}"
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'error': str(error),
                'body': 'Failed to update the draft due to a database error.'
            }
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not update draft")
        # Return a generic error response for unexpected errors
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'error': str(general_error),
            'body': 'An unexpected error occurred while updating the draft.'
        }

def delete_draft_versions(session_id, user_id):
    """Drop every version row for a draft. Snapshots carry contact names, emails
    and organisation data, so they cannot outlive the draft."""
    if not _version_table:
        return 0

    deleted = 0
    key = dv.draft_key(user_id, session_id)
    try:
        start_key = None
        while True:
            query_kwargs = {
                'KeyConditionExpression': Key('draft_key').eq(key),
                'ProjectionExpression': '#r',
                'ExpressionAttributeNames': {'#r': 'rev'},
            }
            if start_key:
                query_kwargs['ExclusiveStartKey'] = start_key
            response = _version_table.query(**query_kwargs)
            items = response.get('Items', [])
            if items:
                with _version_table.batch_writer() as batch:
                    for item in items:
                        batch.delete_item(Key={'draft_key': key, 'rev': item['rev']})
                        deleted += 1
            start_key = response.get('LastEvaluatedKey')
            if not start_key:
                break
    except ClientError as error:
        print(f"Failed to delete version rows for {key}: {error}")
    return deleted


# Define a function to delete a draft from the DynamoDB table
def delete_draft(session_id, user_id):
    try:
        # Attempt to delete an item from the DynamoDB table based on the provided session_id and user_id.
        table.delete_item(Key={"user_id": user_id, "session_id": session_id})
        delete_draft_versions(session_id, user_id)

        # If no exceptions are raised, return a response indicating that the deletion was successful.
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'id': session_id,
                'deleted': True,
                'message': 'Draft deleted successfully'
            })
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not delete draft")
        # Handle specific DynamoDB client errors. If the item cannot be found or another error occurs, return the appropriate message.
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'id': session_id,
                    'deleted': False,
                    'message': f"No record found with session id: {session_id}"
                })
            }
        else:
            return {
                'statusCode': 500,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'id': session_id,
                    'deleted': False,
                    'message': f"Error occurred: {error}"
                })
            }

# Define a function to delete all drafts for a user from the DynamoDB table
def delete_user_drafts(user_id):
    try:
        listing = list_drafts_by_user_id(user_id, limit=200)
        drafts = json.loads(listing['body']) if isinstance(listing.get('body'), str) else listing.get('body') or []
        ret_value = []

        for draft in drafts:
            session_id = draft.get("sessionId")
            if not session_id:
                continue
            result = delete_draft(session_id, user_id)
            deleted = json.loads(result['body']).get('deleted', False)
            ret_value.append({"id": session_id, "deleted": deleted})

        # Return a list of dictionaries, each containing the session ID and deletion result.
        return ret_value

    except Exception as error:
        # Handle any unexpected errors that might occur during the process.
        # Return a list containing a single dictionary with an error message.
        return [{"error": str(error)}]

# Define a function to list drafts by user ID from the DynamoDB table
def list_drafts_by_user_id(user_id, document_identifier=None, limit=15):
    items = []  # Initialize an empty list to store the fetched draft items

    try:
        last_evaluated_key = None  # Initialize the key to control the pagination loop

        # Keep fetching until we have 15 items or there are no more items to fetch
        while len(items) < limit:
            query_params = {
                'IndexName': 'LastModifiedIndex',
                'ProjectionExpression': '#sid, #ttl, #doc_id, #st, #lm',
                'ExpressionAttributeNames': {
                    '#sid': 'session_id',
                    '#ttl': 'title',
                    '#doc_id': 'document_identifier',
                    '#st': 'status',
                    '#lm': 'last_modified'
                },
                'KeyConditionExpression': Key('user_id').eq(user_id),
                'ScanIndexForward': False,
                'Limit': limit - len(items),
            }

            if document_identifier:
                query_params['FilterExpression'] = Attr('document_identifier').eq(document_identifier)

            if last_evaluated_key:
                query_params['ExclusiveStartKey'] = last_evaluated_key

            response = table.query(**query_params)
            items.extend(response.get("Items", []))

            last_evaluated_key = response.get("LastEvaluatedKey")  # Update the pagination key
            if not last_evaluated_key:  # Break the loop if there are no more items to fetch
                break

        # Sort the items by 'last_modified' in descending order to ensure the latest drafts appear first
        sorted_items = sorted(items, key=lambda x: x.get('last_modified', ''), reverse=True)
        sorted_items = list(map(lambda x: {
            "sessionId": x.get("session_id"),
            "title": x.get("title", "").strip(),
            "documentIdentifier": x.get("document_identifier", ""),
            "lastModified": x.get("last_modified", ""),
            "status": x.get("status", "project_basics")
        }, sorted_items))

        # Return the sorted items directly in the body
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(sorted_items)
        }

    except ClientError as error:
        print(f"DynamoDB ClientError: {str(error)}")
        error_code = error.response['Error']['Code']
        error_message = error.response['Error']['Message']
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': {"error": f"No record found for user id: {user_id}"}
            }
        elif error_code == "ProvisionedThroughputExceededException":
            return {
                'statusCode': 429,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': {"error": "Request limit exceeded"}
            }
        elif error_code == "ValidationException":
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': {"error": f"Invalid input parameters: {error_message}"}
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': {"error": f"Internal server error: {error_code} - {error_message}"}
            }
    except KeyError as key_error:
        print(f"KeyError: {str(key_error)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': {"error": f"Key error: {str(key_error)}"}
        }
    except Exception as general_error:
        print(f"Unexpected error: {str(general_error)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': {"error": f"An unexpected error occurred: {str(general_error)}"}
        }

# Version rows are produced by the draft-table stream consumer; see
# shared/draft_versions.py for the rev invariant.

VERSION_META_PROJECTION = '#r, created_at, #src, #lbl, changed_sections, section_word_counts, total_word_count, oversize'
VERSION_META_NAMES = {'#r': 'rev', '#src': 'source', '#lbl': 'label'}


def _version_unavailable():
    return _json_response(503, {'error': 'Version history is not configured'})


def list_draft_versions(session_id, user_id, limit=None):
    if not _version_table:
        return _version_unavailable()
    try:
        response = _version_table.query(
            KeyConditionExpression=Key('draft_key').eq(dv.draft_key(user_id, session_id)),
            ProjectionExpression=VERSION_META_PROJECTION,
            ExpressionAttributeNames=VERSION_META_NAMES,
            ScanIndexForward=False,
            Limit=limit or dv.MAX_UNLABELED_VERSIONS,
        )
        return _json_response(200, {'versions': response.get('Items', [])})
    except ClientError as error:
        print(f"Caught error: could not list draft versions - {error}")
        return _json_response(500, {'error': 'Failed to list draft versions'})


def get_draft_version(session_id, user_id, rev):
    if not _version_table:
        return _version_unavailable()
    try:
        item = _version_table.get_item(
            Key={'draft_key': dv.draft_key(user_id, session_id), 'rev': int(rev)}
        ).get('Item')
    except ClientError as error:
        print(f"Caught error: could not get draft version - {error}")
        return _json_response(500, {'error': 'Failed to read draft version'})

    if not item:
        return _json_response(404, {'error': f'No version {rev} for session {session_id}'})

    payload = {
        'rev': item.get('rev'),
        'created_at': item.get('created_at'),
        'source': item.get('source'),
        'label': item.get('label'),
        'changed_sections': item.get('changed_sections', []),
        'oversize': bool(item.get('oversize')),
        'content': None,
    }
    if not payload['oversize'] and item.get('body_gz') is not None:
        try:
            payload['content'] = dv.decompress_body(item['body_gz'])
        except (OSError, ValueError) as error:
            print(f"Corrupt version body for rev {rev}: {error}")
            payload['oversize'] = True

    return _json_response(200, payload)


def restore_draft_version(session_id, user_id, rev, sections_only=None):
    """Write a past snapshot back onto the draft. This is an ordinary draft
    write, so the stream consumer snapshots the pre-restore state and the
    restore is itself undoable."""
    if not _version_table:
        return _version_unavailable()

    try:
        version = _version_table.get_item(
            Key={'draft_key': dv.draft_key(user_id, session_id), 'rev': int(rev)}
        ).get('Item')
    except ClientError as error:
        print(f"Caught error: could not read version for restore - {error}")
        return _json_response(500, {'error': 'Failed to read draft version'})

    if not version:
        return _json_response(404, {'error': f'No version {rev} for session {session_id}'})
    if version.get('oversize') or version.get('body_gz') is None:
        return _json_response(422, {
            'error': 'oversize',
            'message': 'This version was too large to store and cannot be restored.'
        })

    try:
        snapshot = dv.decompress_body(version['body_gz'])
    except (OSError, ValueError) as error:
        print(f"Corrupt version body for rev {rev}: {error}")
        return _json_response(422, {'error': 'Stored version could not be read'})

    snapshot_sections = snapshot.get('sections') or {}

    if sections_only:
        try:
            current = table.get_item(Key={"user_id": user_id, "session_id": session_id}).get("Item") or {}
        except ClientError as error:
            print(f"Caught error: could not read draft for partial restore - {error}")
            return _json_response(500, {'error': 'Failed to read draft'})

        merged = dict(current.get('sections') or {})
        restored = []
        for name in sections_only:
            if name in snapshot_sections:
                merged[name] = snapshot_sections[name]
                restored.append(name)
        if not restored:
            return _json_response(404, {'error': 'None of the requested sections exist in that version'})
        result = update_draft(
            session_id=session_id,
            user_id=user_id,
            sections=merged,
            status=current.get('status'),
            last_write_source='restore',
        )
    else:
        restored = sorted(snapshot_sections.keys())
        result = update_draft(
            session_id=session_id,
            user_id=user_id,
            sections=snapshot_sections,
            title=snapshot.get('title'),
            project_basics=snapshot.get('project_basics'),
            questionnaire=snapshot.get('questionnaire'),
            additional_info=snapshot.get('additional_info'),
            uploaded_files=snapshot.get('uploaded_files'),
            status=snapshot.get('status'),
            last_write_source='restore',
        )

    if result.get('statusCode') != 200:
        return result

    body = json.loads(result['body'])
    body['restoredFrom'] = int(rev)
    body['restoredSections'] = restored
    return _json_response(200, body)


def label_draft_version(session_id, user_id, rev, label):
    """Name a version. Labeled rows drop their TTL and are never pruned."""
    if not _version_table:
        return _version_unavailable()

    key = {'draft_key': dv.draft_key(user_id, session_id), 'rev': int(rev)}
    try:
        if label:
            _version_table.update_item(
                Key=key,
                UpdateExpression='SET #lbl = :lbl REMOVE #ttl',
                ConditionExpression='attribute_exists(draft_key)',
                ExpressionAttributeNames={'#lbl': 'label', '#ttl': 'ttl'},
                ExpressionAttributeValues={':lbl': label},
            )
        else:
            _version_table.update_item(
                Key=key,
                UpdateExpression='SET #ttl = :ttl REMOVE #lbl',
                ConditionExpression='attribute_exists(draft_key)',
                ExpressionAttributeNames={'#lbl': 'label', '#ttl': 'ttl'},
                ExpressionAttributeValues={
                    ':ttl': int(datetime.now(timezone.utc).timestamp()) + dv.UNLABELED_TTL_SECONDS
                },
            )
    except ClientError as error:
        if error.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _json_response(404, {'error': f'No version {rev} for session {session_id}'})
        print(f"Caught error: could not label draft version - {error}")
        return _json_response(500, {'error': 'Failed to label draft version'})

    return _json_response(200, {'rev': int(rev), 'label': label or None})


def create_draft_version(session_id, user_id, label=None):
    """Snapshot the draft as it stands now, for an explicit "Save version".
    Written under the draft's current rev, the same slot the stream consumer will
    later fill with this same content, so whichever lands first wins."""
    if not _version_table:
        return _version_unavailable()

    try:
        item = table.get_item(Key={"user_id": user_id, "session_id": session_id}).get("Item")
    except ClientError as error:
        print(f"Caught error: could not read draft for snapshot - {error}")
        return _json_response(500, {'error': 'Failed to read draft'})

    if not item:
        return _json_response(404, {'error': f'No record found with session id: {session_id}'})

    rev = int(item.get('rev') or 0)
    content = dv.snapshot_content(item)
    row = dv.build_version_item(
        user_id=user_id,
        session_id=session_id,
        rev=rev,
        content=content,
        created_at=_now_iso(),
        source='manual_snapshot',
        label=label,
        changed=[],
        ttl=int(datetime.now(timezone.utc).timestamp()) + dv.UNLABELED_TTL_SECONDS,
    )

    try:
        _version_table.put_item(Item=row, ConditionExpression='attribute_not_exists(#r)',
                                ExpressionAttributeNames={'#r': 'rev'})
    except ClientError as error:
        if error.response['Error']['Code'] != 'ConditionalCheckFailedException':
            print(f"Caught error: could not snapshot draft - {error}")
            return _json_response(500, {'error': 'Failed to save version'})
        return label_draft_version(session_id, user_id, rev, label)

    return _json_response(200, {'rev': rev, 'label': label or None, 'oversize': bool(row.get('oversize'))})


# Main Lambda handler function
def lambda_handler(event, context):
    try:
        request_context = event.get('requestContext') or {}
        is_apigw_invocation = bool(request_context)
        authenticated_user_id = None
        caller_state = None
        if is_apigw_invocation:
            try:
                claims = request_context['authorizer']['jwt']['claims']
                authenticated_user_id = claims['sub']
                caller_state = str(claims.get('custom:state') or '').strip().upper()
            except (KeyError, TypeError):
                return {
                    'statusCode': 401,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Unauthorized: missing JWT claims'})
                }

            if isinstance(event.get('body'), str):
                try:
                    body_data = json.loads(event['body'])
                except json.JSONDecodeError:
                    body_data = {}
            else:
                body_data = dict(event.get('body') or {})
            body_data['user_id'] = authenticated_user_id
            event = {**event, 'body': body_data}

        # Parse and validate request using Pydantic
        request = parse_lambda_event_body(event, DraftOperationRequest)

        # Extract validated fields
        operation = request.operation
        user_id = authenticated_user_id if is_apigw_invocation else request.user_id
        session_id = request.session_id
        sections = request.sections
        title = request.title
        document_identifier = request.document_identifier
        project_basics = request.project_basics
        questionnaire = request.questionnaire
        last_modified = request.last_modified
        status = request.status
        additional_info = request.additional_info
        uploaded_files = request.uploaded_files
        expected_rev = request.expected_rev
        last_write_source = request.last_write_source

        # Route to appropriate operation handler
        if operation == 'add_draft':
            new_title = title or f"Draft on {_now_iso()}"
            result = add_draft(session_id, user_id, sections, new_title, document_identifier, project_basics, questionnaire, last_modified, status, additional_info, uploaded_files, last_write_source)
            # Creating a draft is both a draft-created event and "pursuing" its grant.
            record_event('draft_created', user_id, caller_state, document_identifier)
            if document_identifier:
                record_event('nofo_pursue', user_id, caller_state, document_identifier)
            return result
        elif operation == 'get_draft':
            return get_draft(session_id, user_id)
        elif operation == 'update_draft':
            # Reaching 'submitted' completes the application (funnel terminal). Everything short of
            # that, once stale, is an abandonment — the funnel is derived from DraftTable statuses.
            if status == 'submitted':
                record_event('draft_completed', user_id, caller_state, document_identifier)
            return update_draft(
                session_id=session_id,
                user_id=user_id,
                sections=sections,
                title=title,
                document_identifier=document_identifier,
                project_basics=project_basics,
                questionnaire=questionnaire,
                last_modified=last_modified,
                status=status,
                additional_info=additional_info,
                uploaded_files=uploaded_files,
                expected_rev=expected_rev,
                last_write_source=last_write_source
            )
        elif operation == 'list_draft_versions':
            return list_draft_versions(session_id, user_id, request.limit)
        elif operation == 'get_draft_version':
            return get_draft_version(session_id, user_id, request.rev)
        elif operation == 'restore_draft_version':
            result = restore_draft_version(session_id, user_id, request.rev, request.sections_only)
            if result.get('statusCode') == 200:
                record_event('draft_version_restored', user_id, caller_state, document_identifier)
            return result
        elif operation == 'label_draft_version':
            return label_draft_version(session_id, user_id, request.rev, request.label)
        elif operation == 'create_draft_version':
            return create_draft_version(session_id, user_id, request.label)
        elif operation == 'list_drafts_by_user_id':
            # Convert undefined to None for document_identifier
            doc_id = None if document_identifier == 'undefined' else document_identifier
            return list_drafts_by_user_id(user_id, document_identifier=doc_id)
        elif operation == 'list_all_drafts_by_user_id':
            # Convert undefined to None for document_identifier
            doc_id = None if document_identifier == 'undefined' else document_identifier
            return list_drafts_by_user_id(user_id, document_identifier=doc_id, limit=100)
        elif operation == 'delete_draft':
            return delete_draft(session_id, user_id)
        elif operation == 'delete_user_drafts':
            return delete_user_drafts(user_id)
        else:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
            }
    except ValidationError as e:
        # Return detailed validation errors
        error_messages = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'error': 'Validation error',
                'details': error_messages
            })
        }
    except ValueError as e:
        # Handle custom validation errors
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('Invalid JSON in request body')
        }
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('An unexpected error occurred')
        }