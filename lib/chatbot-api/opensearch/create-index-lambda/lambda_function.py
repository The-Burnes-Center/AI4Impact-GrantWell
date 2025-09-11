"""
This Lambda function creates an index in an OpenSearch collection.
It defines the index settings and mappings, obtains AWS credentials, and signs the AWS API request.
"""

import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from botocore.awsrequest import AWSRequest
import json
import time

def lambda_handler(event, context):
    # 1. Defining the request body for the index and field creation
    host = os.environ["COLLECTION_ENDPOINT"]
    print(f"Collection Endpoint: {host}")
    index_name = os.environ["INDEX_NAME"]
    print(f"Index name: {index_name}")    
        
    payload = {
      "settings": {
        "index": {
          "knn": True,
          "knn.algo_param.ef_search": 512
        }
      },
      "mappings": {
        "properties": {
          "vector_field": {
            "type": "knn_vector",
            "dimension": int(os.environ["EMBEDDING_DIM"]),
            "method": {
              "name": "hnsw",
              "space_type": "innerproduct",
              "engine": "faiss",
              "parameters": {
                "ef_construction": 512,
                "m": 16
              }
            }
          },
          "metadata_field": {"type": "text", "index": False},
          "text_field": {"type": "text"},
        }
      }
    }
    
    # 2. Obtaining AWS credentials and signing the AWS API request 
    region = os.environ["REGION"]
    service = 'aoss'
    credentials = boto3.Session().get_credentials()    
    payload_json = json.dumps(payload)
    auth = AWSV4SignerAuth(credentials, region, service)

    client = OpenSearch(
        hosts=[{"host": host, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        pool_maxsize=20,
    )
    
    try:
        print(f"Attempting to create index: {index_name}")
        response = client.indices.create(index_name, body=payload_json)  
        print(f"Index creation successful: {response}")
        print("Waiting 60 seconds for index to be available...")
        time.sleep(60)   
        
        # Verify the index was created
        print("Verifying index exists...")
        exists_response = client.indices.exists(index_name)
        print(f"Index exists check: {exists_response}")
        
        return response
    except Exception as e:
        print(f"Index creation failed for index: {index_name}")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        
        # Check if index already exists
        try:
            exists = client.indices.exists(index_name)
            print(f"Index already exists check: {exists}")
            if exists:
                print("Index already exists, returning success")
                return True
        except Exception as exists_error:
            print(f"Error checking if index exists: {exists_error}")
        
        # Re-raise the original exception to make the custom resource fail visibly
        raise e
