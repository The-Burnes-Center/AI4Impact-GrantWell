"""
Deletes a document and its metadata from S3, then its type and relevance rows (keyed as in
document-relevance.mjs), then triggers KB sync.

Env: USER_DOCUMENTS_BUCKET, SYNC_KB_FUNCTION_NAME, USER_DOCUMENT_TABLE_NAME
"""

import hashlib
import json
import boto3
import os
from boto3.dynamodb.conditions import Key

s3 = boto3.resource('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

BUCKET = os.environ.get('USER_DOCUMENTS_BUCKET')
SYNC_FUNCTION = os.environ.get('SYNC_KB_FUNCTION_NAME')
DOCUMENT_TABLE = os.environ.get('USER_DOCUMENT_TABLE_NAME')


def _hash_part(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:32]


def delete_document_rows(user_id, key):
    """The document's type row and every grant's relevance row and review request for it."""
    table = dynamodb.Table(DOCUMENT_TABLE)
    keys = [{'user_id': user_id, 'sk': f"DOC#{_hash_part(key)}"}]
    query = {
        'KeyConditionExpression': Key('user_id').eq(user_id) & Key('sk').begins_with(f"REL#{_hash_part(key)}#"),
        'ProjectionExpression': 'user_id, sk',
    }
    while True:
        page = table.query(**query)
        keys.extend(page.get('Items', []))
        if 'LastEvaluatedKey' not in page:
            break
        query['ExclusiveStartKey'] = page['LastEvaluatedKey']
    with table.batch_writer() as batch:
        for row in keys:
            batch.delete_item(Key={'user_id': row['user_id'], 'sk': row['sk']})


def lambda_handler(event, context):
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        user_id = claims.get('cognito:username') or claims.get('username')

        if not user_id:
            return _response(401, {'message': 'User not authenticated'})

        payload = json.loads(event['body'])
        key = payload.get('KEY')

        if not key or not key.startswith(f"{user_id}/") or any(s in (".", "..") for s in key.split("/")):
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

        if DOCUMENT_TABLE:
            try:
                delete_document_rows(user_id, key)
            except Exception as rows_err:
                print(f"Could not delete the document's type and relevance rows: {type(rows_err).__name__}")

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
