"""
This Lambda function handles session management for the chatbot application.
It supports creating, retrieving, updating, and deleting sessions stored in a DynamoDB table.
The function also lists sessions by user ID and deletes all sessions for a user.
"""

import os
import boto3
from botocore.exceptions import ClientError
import json
from datetime import datetime
from boto3.dynamodb.conditions import Key, Attr
from pydantic import ValidationError
from shared.models import SessionOperationRequest, parse_lambda_event_body

# Retrieve DynamoDB table name from environment variables
DDB_TABLE_NAME = os.environ["DDB_TABLE_NAME"]

# Initialize a DynamoDB resource using boto3 with a specific AWS region
dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
# Connect to the specified DynamoDB table
table = dynamodb.Table(DDB_TABLE_NAME)

# A chat is a header item (keyed by its session_id) plus one item per turn, keyed
# "<session_id>#turn#<n>". Turn items carry no time_stamp, so the TimeIndex lists headers only.
# Older chats keep every turn in the header's chat_history list; they convert on next open or write.
TURN_MARKER = "#turn#"


def turn_key(session_id, number):
    return f"{session_id}{TURN_MARKER}{number:06d}"


def flatten_entries(entries):
    flat = []
    for entry in entries or []:
        if isinstance(entry, list):
            flat.extend(e for e in entry if isinstance(e, dict))
        elif isinstance(entry, dict):
            flat.append(entry)
    return flat


def query_turns(user_id, session_id, keys_only=False):
    params = {
        'KeyConditionExpression': Key('user_id').eq(user_id) & Key('session_id').begins_with(session_id + TURN_MARKER),
    }
    if keys_only:
        params['ProjectionExpression'] = 'session_id'
    items = []
    while True:
        response = table.query(**params)
        items.extend(response.get('Items', []))
        if not response.get('LastEvaluatedKey'):
            return items
        params['ExclusiveStartKey'] = response['LastEvaluatedKey']


def write_turns(user_id, session_id, entries, first_number):
    with table.batch_writer() as batch:
        for offset, entry in enumerate(entries):
            number = first_number + offset
            batch.put_item(Item={
                'user_id': user_id,
                'session_id': turn_key(session_id, number),
                'turn': number,
                'entry': entry,
            })


def delete_turn_items(user_id, keys):
    with table.batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key={'user_id': user_id, 'session_id': key})


def convert_legacy_session(user_id, session_id, header):
    """Move a chat_history list into turn items. Safe to repeat: the turn keys are fixed."""
    entries = flatten_entries(header.get('chat_history'))
    write_turns(user_id, session_id, entries, 1)
    try:
        table.update_item(
            Key={'user_id': user_id, 'session_id': session_id},
            UpdateExpression='REMOVE chat_history SET turn_count = :n',
            ConditionExpression='attribute_exists(chat_history)',
            ExpressionAttributeValues={':n': len(entries)},
        )
    except ClientError as error:
        if error.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
    return entries


def add_session(session_id, user_id, chat_history, title, new_chat_entry, document_identifier):
    try:
        entries = flatten_entries(new_chat_entry) if new_chat_entry else flatten_entries(chat_history)
        stale = [item['session_id'] for item in query_turns(user_id, session_id, keys_only=True)
                 if int(item['session_id'].rsplit(TURN_MARKER, 1)[1]) > len(entries)]
        delete_turn_items(user_id, stale)
        write_turns(user_id, session_id, entries, 1)
        table.put_item(Item={
            'user_id': user_id,
            'session_id': session_id,
            "title": title.strip(),
            "time_stamp": str(datetime.now()),
            'document_identifier': document_identifier,
            'turn_count': len(entries),
        })
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'message': 'Session created successfully'})
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not add new session")
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f"No record found with session id: {session_id}")
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(str(error))
            }

# A function to retrieve a session from DynamoDB based on session_id and user_id
def get_session(session_id, user_id):
    try:
        item = table.get_item(Key={"user_id": user_id, "session_id": session_id}).get("Item")
        if item:
            if 'chat_history' in item:
                history = convert_legacy_session(user_id, session_id, item)
            else:
                history = [turn['entry'] for turn in query_turns(user_id, session_id)]
            item.pop('turn_count', None)
            item['chat_history'] = history
    except ClientError as error:
        print("Caught error: DynamoDB error - could not get session")
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f"No record found with session id: {session_id}")
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('An unexpected error occurred')
            }

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(item or {})
    }

def reserve_turns(session_id, user_id, count, title, document_identifier):
    """Claim the next `count` turn numbers; a title also fills in a missing header."""
    update = 'ADD turn_count :k'
    values = {':k': count}
    if title:
        update += ' SET title = if_not_exists(title, :t), time_stamp = if_not_exists(time_stamp, :ts)'
        update += ', document_identifier = if_not_exists(document_identifier, :d)'
        values.update({':t': title.strip(), ':ts': str(datetime.now()), ':d': document_identifier})
    response = table.update_item(
        Key={"user_id": user_id, "session_id": session_id},
        UpdateExpression=update,
        ConditionExpression='attribute_not_exists(chat_history)',
        ExpressionAttributeValues=values,
        ReturnValues="UPDATED_NEW",
    )
    return int(response['Attributes']['turn_count'])

# Append turns to a session, creating its header when a title is given and none exists
def update_session(session_id, user_id, new_chat_entry, title=None, document_identifier=None):
    try:
        entries = flatten_entries(new_chat_entry)
        if entries:
            try:
                last = reserve_turns(session_id, user_id, len(entries), title, document_identifier)
            except ClientError as error:
                if error.response['Error']['Code'] != 'ConditionalCheckFailedException':
                    raise
                header = table.get_item(Key={"user_id": user_id, "session_id": session_id}).get("Item") or {}
                convert_legacy_session(user_id, session_id, header)
                last = reserve_turns(session_id, user_id, len(entries), title, document_identifier)
            write_turns(user_id, session_id, entries, last - len(entries) + 1)
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'message': 'Session updated successfully'})
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not update session")
        error_code = error.response['Error']['Code']
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
                'body': 'Failed to update the session due to a database error.'
            }
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not update session")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'error': str(general_error),
            'body': 'An unexpected error occurred while updating the session.'
        }

# Turns go first so a failed delete leaves the chat listed and the user can retry.
def delete_session(session_id, user_id):
    try:
        delete_turn_items(user_id, [item['session_id'] for item in query_turns(user_id, session_id, keys_only=True)])
        table.delete_item(Key={"user_id": user_id, "session_id": session_id})
    except ClientError as error:
        print("Caught error: DynamoDB error - could not delete session")
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                "id": session_id,
                "deleted": False,
                'headers': {'Access-Control-Allow-Origin': '*'},
                "body": json.dumps(f"No record found with session id: {session_id}")
            }
        else:
            return {
                'statusCode': 500,
                "id": session_id,
                "deleted": False,
                'headers': {'Access-Control-Allow-Origin': '*'},
                "body": json.dumps(f"Error occurred: {error}")
            }

    return {
        'statusCode': 200,
        "id": session_id,
        'headers': {'Access-Control-Allow-Origin': '*'},
        "deleted": True
    }

# Define a function to delete all sessions for a user from the DynamoDB table
def delete_user_sessions(user_id):
    try:
        # Fetch all sessions associated with the given user_id. This function should return a list of session dictionaries.
        sessions = list_sessions_by_user_id(user_id)
        ret_value = []  # Initialize a list to hold the results of the deletion attempts.

        # Iterate through each session fetched from the database.
        for session in sessions:
            # Attempt to delete each session and capture the result.
            result = delete_session(session["SessionId"], user_id)
            # Append the result of the deletion attempt to the ret_value list. 
            # This includes the session ID and whether the deletion was successful.
            ret_value.append({"id": session["SessionId"], "deleted": result["deleted"]})

        # Return a list of dictionaries, each containing the session ID and deletion result.
        return ret_value

    except Exception as error:
        # Handle any unexpected errors that might occur during the process.
        # Return a list containing a single dictionary with an error message.
        return [{"error": str(error)}]

# Define a function to list sessions by user ID from the DynamoDB table
def list_sessions_by_user_id(user_id, document_identifier=None, limit=15):
    items = []  # Initialize an empty list to store the fetched session items

    try:
        last_evaluated_key = None  # Initialize the key to control the pagination loop

        # Keep fetching until we have 15 items or there are no more items to fetch
        while len(items) < limit:
            query_params = {
                'IndexName': 'TimeIndex',
                'ProjectionExpression': 'session_id, title, time_stamp, document_identifier',
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

    except ClientError as error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # More detailed client error handling based on DynamoDB error codes
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': f"No record found for user id: {user_id}"
            }
        elif error_code == "ProvisionedThroughputExceededException":
            return {
                'statusCode': 429,
                'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
                'body': "Request limit exceeded"
            }
        elif error_code == "ValidationException":
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
                'body': "Invalid input parameters"
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
                'body': "Internal server error"
            }
    except KeyError as key_error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # Handle errors that might occur if expected keys are missing in the response
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
            'body': f"Key error: {str(key_error)}"
        }
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # Generic error handling for any other unforeseen errors
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
            'body': json.dumps(f"An unexpected error occurred: {str(general_error)}")
        }

    # Sort the items by 'time_stamp' in descending order to ensure the latest sessions appear first
    sorted_items = sorted(items, key=lambda x: x['time_stamp'], reverse=True)
    sorted_items = list(map(lambda x: {"time_stamp": x["time_stamp"], "session_id": x["session_id"], "title": x["title"].strip(), "document_identifier": x.get("document_identifier", "")}, sorted_items))

    # Prepare the HTTP response object with a status code, headers, and body
    response = {
        'statusCode': 200,  # HTTP status code indicating a successful operation
        'headers': {'Access-Control-Allow-Origin': '*'},  # CORS header allowing access from any domain
        'body': json.dumps(sorted_items)  # Convert the sorted list of items to JSON format for the response body
    }
    return response  # Return the response object

# Main Lambda handler function
def lambda_handler(event, context):
    try:
        # When invoked through API Gateway, the caller is identified by the JWT
        # claims attached by the authorizer — never trust user_id from the body.
        # When invoked directly by another Lambda (e.g. the WebSocket chat handler,
        # which has already authenticated the principal at $connect), no
        # requestContext is present and we fall back to the body value.
        request_context = event.get('requestContext') or {}
        is_apigw_invocation = bool(request_context)
        authenticated_user_id = None
        if is_apigw_invocation:
            try:
                authenticated_user_id = (
                    request_context['authorizer']['jwt']['claims']['sub']
                )
            except (KeyError, TypeError):
                return {
                    'statusCode': 401,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Unauthorized: missing JWT claims'})
                }

            # Inject the authenticated sub into the body so Pydantic validation
            # sees a valid user_id even when the client omits or spoofs it.
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
        request = parse_lambda_event_body(event, SessionOperationRequest)

        # Extract validated fields
        operation = request.operation
        user_id = authenticated_user_id if is_apigw_invocation else request.user_id
        session_id = request.session_id
        if session_id and '#' in session_id:
            raise ValueError("session_id must not contain '#'")
        chat_history = request.chat_history
        new_chat_entry = request.new_chat_entry
        title = request.title or f"Chat on {str(datetime.now())}"
        document_identifier = request.document_identifier

        # Route to appropriate operation handler
        if operation == 'add_session':
            return add_session(session_id, user_id, chat_history, title, new_chat_entry, document_identifier)
        elif operation == 'get_session':
            return get_session(session_id, user_id)
        elif operation == 'update_session':
            return update_session(session_id, user_id, new_chat_entry, request.title, document_identifier)
        elif operation == 'list_sessions_by_user_id':
            return list_sessions_by_user_id(user_id, document_identifier=document_identifier)
        elif operation == 'list_all_sessions_by_user_id':
            return list_sessions_by_user_id(user_id, document_identifier=document_identifier, limit=100)
        elif operation == 'delete_session':
            return delete_session(session_id, user_id)
        elif operation == 'delete_user_sessions':
            return delete_user_sessions(user_id)
        else:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
            }
    except ValidationError as e:
        # A model-level validator reports loc=(), and an unguarded err['loc'][0] made that a 500.
        error_messages = [
            f"{err['loc'][0] if err.get('loc') else 'request'}: {err['msg']}" for err in e.errors()
        ]
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