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
        # Extract user claims and roles from the event
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        roles = json.loads(claims['custom:role'])
        if "Admin" in roles:
            print("admin granted!")
        else:
            return {
                'statusCode': 403,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('User is not authorized to perform this action')
            }
    except Exception as e:
        print(f"Error checking user role: {e}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.')
        }

    # Extract the payload from the event body
    payload = json.loads(event['body'])

    try:
        # Initialize S3 resource and delete the specified object
        s3 = boto3.resource('s3')
        s3.Object(os.environ['BUCKET'], payload['KEY']).delete()
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
