"""
Deletes a document and its metadata from S3, then triggers KB sync.

Env: USER_DOCUMENTS_BUCKET, SYNC_KB_FUNCTION_NAME
"""

import json
import boto3
import os

s3 = boto3.resource('s3')
lambda_client = boto3.client('lambda')

BUCKET = os.environ.get('USER_DOCUMENTS_BUCKET')
SYNC_FUNCTION = os.environ.get('SYNC_KB_FUNCTION_NAME')


def lambda_handler(event, context):
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        user_id = claims.get('cognito:username') or claims.get('username')

        if not user_id:
            return _response(401, {'message': 'User not authenticated'})

        payload = json.loads(event['body'])
        key = payload.get('KEY')

        if not key or not key.startswith(f"{user_id}/"):
            return _response(403, {'message': 'Unauthorized: Can only delete your own files'})
    except Exception as e:
        print(f"Error processing request: {e}")
        return _response(500, {'message': f'Unable to process request: {str(e)}'})

    try:
        s3.Object(BUCKET, key).delete()
        print(f"Deleted document: {key}")

        metadata_key = f"{key}.metadata.json"
        try:
            s3.Object(BUCKET, metadata_key).delete()
            print(f"Deleted metadata: {metadata_key}")
        except Exception:
            pass

        if SYNC_FUNCTION:
            try:
                lambda_client.invoke(
                    FunctionName=SYNC_FUNCTION,
                    InvocationType='Event',
                    Payload=json.dumps({'syncSource': 'user-documents'})
                )
                print("Triggered KB sync")
            except Exception as sync_err:
                print(f"KB sync trigger failed (non-critical): {sync_err}")

        return _response(200, {'message': 'Document deleted successfully'})
    except Exception as e:
        print(f"Error deleting from S3: {e}")
        return _response(502, {'message': 'Failed to delete document from S3'})


def _response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(body)
    }
