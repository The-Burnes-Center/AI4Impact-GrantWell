"""
This Lambda function handles the synchronization of a knowledge base with a data source.
It checks if any sync jobs are currently running, starts new sync jobs, and retrieves the last sync time.
The function also checks the user's role to ensure they have the necessary permissions to perform these actions.
"""

import json
import boto3
import os

# Retrieve environment variables for Knowledge Base index and source indices
kb_index = os.environ['KB_ID']
source_index = os.environ['SOURCE']  # NOFO bucket data source
user_documents_source = os.environ.get('USER_DOCUMENTS_SOURCE', '')  # User documents bucket data source

# Initialize a Bedrock Agent client
client = boto3.client('bedrock-agent')

def check_running(data_source_id):
    """
    Check if any sync jobs for the specified data source and index are currently running.

    Args:
        data_source_id: The data source ID to check

    Returns:
        bool: True if there are any ongoing sync or sync-indexing jobs, False otherwise.
    """
    if not data_source_id:
        return False
    
    # List ongoing sync jobs with status 'IN_PROGRESS'
    syncing = client.list_ingestion_jobs(
        dataSourceId=data_source_id,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': ['IN_PROGRESS']
        }]
    )
    
    # List ongoing sync jobs with status 'STARTING'
    starting = client.list_ingestion_jobs(
        dataSourceId=data_source_id,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': ['STARTING']
        }]
    )
    
    # Combine the history of both job types
    hist = starting['ingestionJobSummaries'] + syncing['ingestionJobSummaries']
    
    # Check if there are any jobs in the history
    return len(hist) > 0

def check_any_running():
    """
    Check if any sync jobs are running for either data source.

    Returns:
        bool: True if any sync job is running, False otherwise.
    """
    nofo_running = check_running(source_index)
    user_docs_running = check_running(user_documents_source) if user_documents_source else False
    return nofo_running or user_docs_running

def get_last_sync():
    """
    Retrieve the last sync time from either data source (most recent).

    Returns:
        dict: A response dictionary with the last sync time.
    """
    all_syncs = []
    
    # Get syncs from NOFO bucket data source
    if source_index:
        nofo_syncs = client.list_ingestion_jobs(
            dataSourceId=source_index,
            knowledgeBaseId=kb_index,
            filters=[{
                'attribute': 'STATUS',
                'operator': 'EQ',
                'values': ['COMPLETE']
            }]
        )
        if nofo_syncs.get('ingestionJobSummaries'):
            all_syncs.extend(nofo_syncs['ingestionJobSummaries'])
    
    # Get syncs from user documents bucket data source
    if user_documents_source:
        user_docs_syncs = client.list_ingestion_jobs(
            dataSourceId=user_documents_source,
            knowledgeBaseId=kb_index,
            filters=[{
                'attribute': 'STATUS',
                'operator': 'EQ',
                'values': ['COMPLETE']
            }]
        )
        if user_docs_syncs.get('ingestionJobSummaries'):
            all_syncs.extend(user_docs_syncs['ingestionJobSummaries'])
    
    if not all_syncs:
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('No sync history available')
        }
    
    # Sort by updatedAt and get the most recent
    all_syncs.sort(key=lambda x: x['updatedAt'], reverse=True)
    time = all_syncs[0]["updatedAt"].strftime('%B %d, %Y, %I:%M%p UTC')
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(time)
    }

def start_sync(data_source_id, label):
    """Start an ingestion job; one started by another caller since check_running is not an error."""
    try:
        client.start_ingestion_job(
            dataSourceId=data_source_id,
            knowledgeBaseId=kb_index
        )
        print(f"Started {label} sync for data source: {data_source_id}")
    except client.exceptions.ConflictException:
        print(f"Skipped {label} sync — another ingestion job is already running.")

def lambda_handler(event, context):
    """
    AWS Lambda handler function for handling requests.

    Args:
        event (dict): The event dictionary containing request data.
        context (dict): The context dictionary containing information about the Lambda function execution.

    Returns:
        dict: A response dictionary with a status code, headers, and body.
    """
    
    # Retrieve the resource path from the event dictionary
    resource_path = event.get('rawPath', '')

    # Targeted sync: create-metadata passes syncSource to sync only the relevant data source
    sync_source = event.get('syncSource', '')

    if not resource_path:
        if sync_source == 'user-documents' and user_documents_source:
            if check_running(user_documents_source):
                print("User documents sync already in progress.")
                return
            start_sync(user_documents_source, "user documents")
            return

        if sync_source == 'nofo' and source_index:
            if check_running(source_index):
                print("NOFO sync already in progress.")
                return
            start_sync(source_index, "NOFO bucket")
            return

        # No syncSource specified — sync both (legacy / direct invocations)
        if check_any_running():
            print("Sync already in progress.")
            return

        if user_documents_source:
            start_sync(user_documents_source, "user documents bucket")
        if source_index:
            start_sync(source_index, "NOFO bucket")

        print("Started knowledge base sync.")
        return
    
    # Any signed-in user may poll this (the API's JWT authorizer guarantees one): users
    # wait on it after uploading supporting documents, and it reveals only running/done.
    if "still-syncing" in resource_path:
        status_msg = 'STILL SYNCING' if check_any_running() else 'DONE SYNCING'
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(status_msg)
        }

    # Check admin access
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        roles = json.loads(claims['custom:role'])
        if "Admin" in roles or "Developer" in roles:
            print("admin granted!")
        else:
            return {
                'statusCode': 403,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('User is not authorized to perform this action')
            }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute. Error: {e}')
        }    
        
    if "last-sync" in resource_path:
        return get_last_sync()
