"""
This Lambda function handles draft management for the draft editor application.
It supports creating, retrieving, updating, and deleting drafts stored in a DynamoDB table.
The function also lists drafts by user ID and deletes all drafts for a user.
"""

import os
import boto3
from botocore.exceptions import ClientError
import json
from datetime import datetime
from boto3.dynamodb.conditions import Key, Attr

# Retrieve DynamoDB table name from environment variables
DDB_TABLE_NAME = os.environ["DRAFT_TABLE_NAME"]

# Initialize a DynamoDB resource using boto3 with a specific AWS region
dynamodb = boto3.resource("dynamodb", region_name='us-east-1')
# Connect to the specified DynamoDB table
table = dynamodb.Table(DDB_TABLE_NAME)

# Define a function to add a draft or update an existing one in the DynamoDB table
def add_draft(session_id, user_id, sections, title, document_identifier, project_basics=None, questionnaire=None, last_modified=None):
    try:
        # Create a new item in DynamoDB
        item = {
            "user_id": user_id,
            "session_id": session_id,
            "title": title.strip() if title else "",
            "document_identifier": document_identifier,
            "sections": sections or {},
            "project_basics": project_basics or {},
            "questionnaire": questionnaire or {},
            "last_modified": last_modified or str(datetime.now()),
            "status": "draft"  # Adding default status
        }
        
        # Put the item in DynamoDB
        table.put_item(Item=item)
        
        # Return only the fields we project in queries
        response_item = {
            "sessionId": session_id,
            "title": item["title"],
            "documentIdentifier": item["document_identifier"],
            "lastModified": item["last_modified"]
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(response_item)
        }
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
    response_to_client = {
        'statusCode': 200,  # HTTP status code indicating a successful operation
        'headers': {'Access-Control-Allow-Origin': '*'},  # Allow all domains for CORS
        'body': json.dumps(response.get("Item", {}))  # Convert the retrieved item to JSON format
    }
    # Return the prepared response to the client
    return response_to_client

# Define a function to update a draft in the DynamoDB table
def update_draft(session_id, user_id, sections=None, title=None, document_identifier=None, project_basics=None, questionnaire=None, last_modified=None):
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
            
        # Always update last_modified
        update_parts.append("#lm = :last_modified")
        expression_values[":last_modified"] = last_modified or str(datetime.now())
        expression_names["#lm"] = "last_modified"
        
        # Update the item in DynamoDB
        response = table.update_item(
            Key={"user_id": user_id, "session_id": session_id},
            UpdateExpression="set " + ", ".join(update_parts),
            ExpressionAttributeValues=expression_values,
            ExpressionAttributeNames=expression_names,
            ReturnValues="ALL_NEW"
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
            "lastModified": updated_item.get("last_modified", "")
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(response_item)
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not update draft")
        # Return a structured error message and status code
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

# Define a function to delete a draft from the DynamoDB table
def delete_draft(session_id, user_id):
    try:
        # Attempt to delete an item from the DynamoDB table based on the provided session_id and user_id.
        table.delete_item(Key={"user_id": user_id, "session_id": session_id})
        
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
        # Fetch all drafts associated with the given user_id
        drafts = list_drafts_by_user_id(user_id)
        ret_value = []  # Initialize a list to hold the results of the deletion attempts.

        # Iterate through each draft fetched from the database.
        for draft in drafts:
            # Attempt to delete each draft and capture the result.
            result = delete_draft(draft["session_id"], user_id)
            # Append the result of the deletion attempt to the ret_value list. 
            # This includes the session ID and whether the deletion was successful.
            ret_value.append({"id": draft["session_id"], "deleted": result["deleted"]})

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
            "lastModified": x.get("last_modified", "")
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

# Main Lambda handler function
def lambda_handler(event, context):
    try:
        data = json.loads(event['body'])
        operation = data.get('operation')
        user_id = data.get('user_id')
        session_id = data.get('session_id')
        sections = data.get('sections', {})
        title = data.get('title', f"Draft on {str(datetime.now())}")
        document_identifier = data.get('document_identifier')
        project_basics = data.get('project_basics')
        questionnaire = data.get('questionnaire')
        last_modified = data.get('last_modified')

        if not operation:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('Operation is required')
            }

        if operation == 'add_draft':
            if not all([session_id, user_id]):
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('session_id and user_id are required for add_draft operation')
                }
            return add_draft(session_id, user_id, sections, title, document_identifier, project_basics, questionnaire, last_modified)
        elif operation == 'get_draft':
            if not all([session_id, user_id]):
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('session_id and user_id are required for get_draft operation')
                }
            return get_draft(session_id, user_id)
        elif operation == 'update_draft':
            if not all([session_id, user_id]):
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('session_id and user_id are required for update_draft operation')
                }
            return update_draft(
                session_id=session_id,
                user_id=user_id,
                sections=sections,
                title=title,
                document_identifier=document_identifier,
                project_basics=project_basics,
                questionnaire=questionnaire,
                last_modified=last_modified
            )
        elif operation == 'list_drafts_by_user_id':
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('user_id is required for list_drafts_by_user_id operation')
                }
            # Convert undefined to None for document_identifier
            doc_id = None if document_identifier == 'undefined' else document_identifier
            return list_drafts_by_user_id(user_id, document_identifier=doc_id)
        elif operation == 'list_all_drafts_by_user_id':
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('user_id is required for list_all_drafts_by_user_id operation')
                }
            # Convert undefined to None for document_identifier
            doc_id = None if document_identifier == 'undefined' else document_identifier
            return list_drafts_by_user_id(user_id, document_identifier=doc_id, limit=100)
        elif operation == 'delete_draft':
            if not all([session_id, user_id]):
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('session_id and user_id are required for delete_draft operation')
                }
            return delete_draft(session_id, user_id)
        elif operation == 'delete_user_drafts':
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('user_id is required for delete_user_drafts operation')
                }
            return delete_user_drafts(user_id)
        else:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
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