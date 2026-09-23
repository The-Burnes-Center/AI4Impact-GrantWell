"""
This Lambda function creates an index in an OpenSearch collection.
It defines the index settings and mappings, obtains AWS credentials, and signs the AWS API request.
"""

import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from opensearchpy.exceptions import RequestError
from botocore.awsrequest import AWSRequest
import json
import time

def lambda_handler(event, context):
    # The index lives and dies with the collection, so only Create has work to do.
    if event.get("RequestType") != "Create":
        return None

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
    
    # Raising makes the Provider report FAILED, so a stack never goes up without its index.
    try:
        client.indices.create(index=index_name, body=payload_json)
    except RequestError as e:
        if e.error != "resource_already_exists_exception":
            raise
        print(f"Index {index_name} already exists")
        return None
    time.sleep(60)
    return None
