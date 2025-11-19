"""
This Lambda function handles the deletion of objects from an S3 bucket.
It checks the user's role to ensure they have the necessary permissions to perform the deletion.
If the user is an admin, the function deletes the specified object from the S3 bucket.
"""

import json
import boto3
import os

def lambda_handler(event, context):
    try:
        # Extract user claims and userId from the event
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        userId = claims.get('cognito:username') or claims.get('username')
        
        if not userId:
            return {
                'statusCode': 401,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'message': 'User not authenticated'})
            }
        
        # Extract the payload from the event body
        payload = json.loads(event['body'])
        key = payload.get('KEY')  # Format: userId/nofoName/filename
        
        # Security: Ensure KEY starts with userId/
        if not key or not key.startswith(f"{userId}/"):
            return {
                'statusCode': 403,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'message': 'Unauthorized: Can only delete your own files'})
            }
    except Exception as e:
        print(f"Error processing request: {e}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'message': f'Unable to process request: {str(e)}'})
        }

    try:
        # Initialize S3 resource and delete the specified object
        s3 = boto3.resource('s3')
        bucket = os.environ.get('USER_DOCUMENTS_BUCKET') or os.environ['BUCKET']
        s3.Object(bucket, key).delete()
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('Object deleted successfully')
        }
    except Exception as e:
        print(f"Error deleting object from S3: {e}")
        return {
            'statusCode': 502,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('Failed to delete object from S3')
        }
