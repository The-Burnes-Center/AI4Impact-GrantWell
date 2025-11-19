"""
This Lambda function handles the deletion of objects from an S3 bucket.
It deletes both the document and its metadata file, then triggers KB sync
to remove the document from the Knowledge Base.
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
        
        # Delete the main document
        s3.Object(bucket, key).delete()
        print(f"Deleted document: {key}")
        
        # Also delete the metadata file if it exists
        metadata_key = f"{key}.metadata.json"
        try:
            s3.Object(bucket, metadata_key).delete()
            print(f"Deleted metadata file: {metadata_key}")
        except Exception as metadata_error:
            # Metadata file might not exist, which is okay
            print(f"Metadata file not found or already deleted: {metadata_key}")
        
        # Trigger KB sync to remove document from Knowledge Base
        # This ensures the deleted document is removed from KB index
        sync_function_name = os.environ.get('SYNC_KB_FUNCTION_NAME')
        if sync_function_name:
            try:
                lambda_client = boto3.client('lambda')
                lambda_client.invoke(
                    FunctionName=sync_function_name,
                    InvocationType='Event'  # Async invocation
                )
                print(f"Triggered KB sync to remove deleted document from index")
            except Exception as sync_error:
                print(f"Failed to trigger KB sync (non-critical): {sync_error}")
                # Non-critical - document is deleted from S3, sync can happen later
        
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
