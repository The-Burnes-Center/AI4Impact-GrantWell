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
            client.start_ingestion_job(
                dataSourceId=user_documents_source,
                knowledgeBaseId=kb_index
            )
            print(f"Started user documents sync for data source: {user_documents_source}")
            return

        if sync_source == 'nofo' and source_index:
            if check_running(source_index):
                print("NOFO sync already in progress.")
                return
            client.start_ingestion_job(
                dataSourceId=source_index,
                knowledgeBaseId=kb_index
            )
            print(f"Started NOFO bucket sync for data source: {source_index}")
            return

        # No syncSource specified — sync both (legacy / direct invocations)
        if check_any_running():
            print("Sync already in progress.")
            return

        if user_documents_source:
            try:
                client.start_ingestion_job(
                    dataSourceId=user_documents_source,
                    knowledgeBaseId=kb_index
                )
                print(f"Started user documents bucket sync for data source: {user_documents_source}")
            except client.exceptions.ConflictException:
                print("Skipped user documents sync — another ingestion job is already running.")

        if source_index:
            try:
                client.start_ingestion_job(
                    dataSourceId=source_index,
                    knowledgeBaseId=kb_index
                )
                print(f"Started NOFO bucket sync for data source: {source_index}")
            except client.exceptions.ConflictException:
                print("Skipped NOFO sync — another ingestion job is already running.")

        print("Started knowledge base sync.")
        return
    
    # Check admin access    
    try:
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
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute. Error: {e}')
        }    
        
    # Check if the request is for checking the sync status
    if "still-syncing" in resource_path:
        status_msg = 'STILL SYNCING' if check_any_running() else 'DONE SYNCING'
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(status_msg)
        }
    elif "last-sync" in resource_path:
        return get_last_sync()