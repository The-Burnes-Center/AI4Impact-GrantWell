"""
This Lambda function handles the synchronization of a knowledge base with a data source.
It checks if any sync jobs are currently running, starts new sync jobs, and retrieves the last sync time.
The function also checks the user's role to ensure they have the necessary permissions to perform these actions.
"""

import json
import boto3
import os

# Retrieve environment variables for Knowledge Base index and source index
kb_index = os.environ['KB_ID']
source_index = os.environ['SOURCE']

# Initialize a Bedrock Agent client
client = boto3.client('bedrock-agent')

def check_running():
    """
    Check if any sync jobs for the specified data source and index are currently running.

    Returns:
        bool: True if there are any ongoing sync or sync-indexing jobs, False otherwise.
    """
    # List ongoing sync jobs with status 'IN_PROGRESS'
    syncing = client.list_ingestion_jobs(
        dataSourceId=source_index,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': ['IN_PROGRESS']
        }]
    )
    
    # List ongoing sync jobs with status 'STARTING'
    starting = client.list_ingestion_jobs(
        dataSourceId=source_index,
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

def get_last_sync():
    """
    Retrieve the last sync time for the specified data source and index.

    Returns:
        dict: A response dictionary with the last sync time.
    """
    syncs = client.list_ingestion_jobs(
        dataSourceId=source_index,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': ['COMPLETE']
        }]
    )
    hist = syncs["ingestionJobSummaries"]
    time = hist[0]["updatedAt"].strftime('%B %d, %Y, %I:%M%p UTC')
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

    if not resource_path:
        if check_running():
            print("Sync already in progress.")
            return
        else:
            client.start_ingestion_job(
                dataSourceId=source_index,
                knowledgeBaseId=kb_index
            )
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
        
    # Check if the request is for syncing Knowledge Base
    if "sync-kb" in resource_path:
        if check_running():
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('STILL SYNCING')
            }
        else:
            client.start_ingestion_job(
                dataSourceId=source_index,
                knowledgeBaseId=kb_index
            )
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('STARTED SYNCING')
            }
   
    # Check if the request is for checking the sync status        
    elif "still-syncing" in resource_path:
        status_msg = 'STILL SYNCING' if check_running() else 'DONE SYNCING'
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(status_msg)
        }
    elif "last-sync" in resource_path:
        return get_last_sync()