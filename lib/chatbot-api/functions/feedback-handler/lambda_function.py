"""
This Lambda function handles user feedback for the chatbot application.
It supports creating, retrieving, downloading, and deleting feedback stored in a DynamoDB table.
The function also generates presigned URLs for downloading feedback as CSV files from an S3 bucket.
"""

import json
import uuid
import boto3
import os
from datetime import datetime
from boto3.dynamodb.conditions import Key
from decimal import Decimal
from pydantic import ValidationError
from shared.models import (
    PostFeedbackRequest,
    DownloadFeedbackRequest,
    FeedbackQueryParams,
    FeedbackDeleteParams,
    parse_lambda_event_body,
    parse_query_params
)

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('FEEDBACK_TABLE'))

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return json.JSONEncoder.default(self, obj)

def lambda_handler(event, context):
    # Determine the type of HTTP method
    admin = False
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        roles = json.loads(claims['custom:role'])
        if "Admin" in roles:
            print("admin granted!")
            admin = True
        else:
            print("Caught error: attempted unauthorized admin access")
            admin = False
    except Exception as e:
        print(f"Caught error: admin access and user roles are not present - {e}")

    http_method = event.get('routeKey')
    if 'POST' in http_method:
        if event.get('rawPath') == '/user-feedback/download-feedback' and admin:
            return download_feedback(event)
        return post_feedback(event)
    elif 'GET' in http_method and admin:
        return get_feedback(event)
    elif 'DELETE' in http_method and admin:
        return delete_feedback(event)
    else:
        return {
            'statusCode': 405,
            'body': json.dumps('Method Not Allowed')
        }

def post_feedback(event):
    try:
        # Parse and validate request using Pydantic
        request = parse_lambda_event_body(event, PostFeedbackRequest)
        feedback_data = request.feedbackData
        
        # Generate a unique feedback ID and current timestamp
        feedback_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Prepare the item to store in DynamoDB
        item = {
            'FeedbackID': feedback_id,
            'SessionID': feedback_data.sessionId,
            'UserPrompt': feedback_data.prompt,
            'FeedbackComments': feedback_data.comment or '',
            'Topic': feedback_data.topic or 'N/A (Good Response)',
            'Problem': feedback_data.problem or '',
            'Feedback': feedback_data.feedback,
            'ChatbotMessage': feedback_data.completion,
            'Sources': feedback_data.sources or [],
            'CreatedAt': timestamp,
            'Any': "YES"
        }
        # Put the item into the DynamoDB table
        table.put_item(Item=item)
        if feedback_data.feedback == 0:
            print("Negative feedback placed")
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 200,
            'body': json.dumps({'FeedbackID': feedback_id})
        }
    except ValidationError as e:
        error_messages = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Validation error',
                'details': error_messages
            })
        }
    except Exception as e:
        print(e)
        print("Caught error: DynamoDB error - could not add feedback")
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 500,
            'body': json.dumps('Failed to store feedback: ' + str(e))
        }

def download_feedback(event):
    try:
        # Parse and validate request using Pydantic
        request = parse_lambda_event_body(event, DownloadFeedbackRequest)
        start_time = request.startTime
        end_time = request.endTime
        topic = request.topic
    except ValidationError as e:
        error_messages = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Validation error',
                'details': error_messages
            })
        }

    response = None

    # If topic is any, use the appropriate index
    if not topic or topic == "any":
        query_kwargs = {
            'IndexName': 'AnyIndex',
            'KeyConditionExpression': Key('Any').eq("YES") & Key('CreatedAt').between(start_time, end_time)
        }
    else:
        query_kwargs = {
            'KeyConditionExpression': Key('CreatedAt').between(start_time, end_time) & Key('Topic').eq(topic),
        }

    try:
        response = table.query(**query_kwargs)
    except Exception as e:
        print("Caught error: DynamoDB error - could not load feedback for download")
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 500,
            'body': json.dumps('Failed to retrieve feedback for download: ' + str(e))
        }

    def clean_csv(field):
        field = str(field).replace('"', '""')
        field = field.replace('\n', '').replace(',', '')
        return f'{field}'

    csv_content = "FeedbackID, SessionID, UserPrompt, FeedbackComment, Topic, Problem, Feedback, ChatbotMessage, CreatedAt\n"

    for item in response['Items']:
        csv_content += f"{clean_csv(item['FeedbackID'])}, {clean_csv(item['SessionID'])}, {clean_csv(item['UserPrompt'])}, {clean_csv(item['FeedbackComments'])}, {clean_csv(item['Topic'])}, {clean_csv(item['Problem'])}, {clean_csv(item['Feedback'])}, {clean_csv(item['ChatbotMessage'])}, {clean_csv(item['CreatedAt'])}\n"

    s3 = boto3.client('s3')
    S3_DOWNLOAD_BUCKET = os.environ["FEEDBACK_S3_DOWNLOAD"]

    try:
        file_name = f"feedback-{start_time}-{end_time}.csv"
        s3.put_object(Bucket=S3_DOWNLOAD_BUCKET, Key=file_name, Body=csv_content)
        presigned_url = s3.generate_presigned_url('get_object', Params={'Bucket': S3_DOWNLOAD_BUCKET, 'Key': file_name}, ExpiresIn=3600)
    except Exception as e:
        print("Caught error: S3 error - could not generate download link")
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 500,
            'body': json.dumps('Failed to retrieve feedback for download: ' + str(e))
        }
    return {
        'headers': {
            'Access-Control-Allow-Origin': "*"
        },
        'statusCode': 200,
        'body': json.dumps({'download_url': presigned_url})
    }

def get_feedback(event):
    try:
        # Parse and validate query parameters using Pydantic
        params = parse_query_params(event, FeedbackQueryParams)
        start_time = params.startTime
        end_time = params.endTime
        topic = params.topic
        exclusive_start_key = params.nextPageToken  # Pagination token
    except ValidationError as e:
        error_messages = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Validation error',
                'details': error_messages
            })
        }

        response = None

        if not topic or topic == "any":
            query_kwargs = {
                'IndexName': 'AnyIndex',
                'KeyConditionExpression': Key('Any').eq("YES") & Key('CreatedAt').between(start_time, end_time),
                'ScanIndexForward': False,
                'Limit': 10
            }
        else:
            query_kwargs = {
                'KeyConditionExpression': Key('CreatedAt').between(start_time, end_time) & Key('Topic').eq(topic),
                'ScanIndexForward': False,
                'Limit': 10
            }

        if exclusive_start_key:
            query_kwargs['ExclusiveStartKey'] = json.loads(exclusive_start_key)

        response = table.query(**query_kwargs)

        body = {
            'Items': response['Items'],
        }

        if 'LastEvaluatedKey' in response:
            body['NextPageToken'] = json.dumps(response['LastEvaluatedKey'])

        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 200,
            'body': json.dumps(body, cls=DecimalEncoder)
        }
    except Exception as e:
        print("Caught error: DynamoDB error - could not get feedback")
        return {
            'headers': {
                'Access-Control-Allow-Origin': "*"
            },
            'statusCode': 500,
            'body': json.dumps('Failed to retrieve feedback: ' + str(e))
        }

def delete_feedback(event):
    try:
        # Parse and validate query parameters using Pydantic
        params = parse_query_params(event, FeedbackDeleteParams)
        topic = params.topic
        created_at = params.createdAt
    except ValidationError as e:
        error_messages = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
        return {
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Validation error',
                'details': error_messages
            })
        }
        # Delete the item from the DynamoDB table
        response = table.delete_item(
            Key={
                'Topic': topic,
                'CreatedAt': created_at
            }
        )
        return {
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'statusCode': 200,
            'body': json.dumps({'message': 'Feedback deleted successfully'})
        }
    except Exception as e:
        print("Caught error: DynamoDB error - could not delete feedback")
        return {
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'statusCode': 500,
            'body': json.dumps('Failed to delete feedback: ' + str(e))
        }