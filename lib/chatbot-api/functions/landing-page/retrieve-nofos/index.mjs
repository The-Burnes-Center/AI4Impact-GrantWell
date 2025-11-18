/**
 * This Lambda function retrieves NOFO metadata from DynamoDB (with S3 fallback).
 * It queries DynamoDB for fast retrieval, falling back to S3 if DynamoDB is unavailable or empty.
 */

import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Convert a ReadableStream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Fetch NOFOs from DynamoDB
 */
async function fetchFromDynamoDB(tableName) {
  const dynamoClient = new DynamoDBClient();
  
  try {
    // Query active NOFOs using StatusIndex GSI
    const activeQuery = new QueryCommand({
      TableName: tableName,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':status': 'active',
      }),
    });

    const activeResult = await dynamoClient.send(activeQuery);
    const activeNofos = (activeResult.Items || []).map(item => unmarshall(item));

    // Query archived NOFOs
    const archivedQuery = new QueryCommand({
      TableName: tableName,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':status': 'archived',
      }),
    });

    const archivedResult = await dynamoClient.send(archivedQuery);
    const archivedNofos = (archivedResult.Items || []).map(item => unmarshall(item));

    // Combine all NOFOs
    const allNofos = [...activeNofos, ...archivedNofos];

    console.log(`Retrieved ${allNofos.length} NOFOs from DynamoDB (${activeNofos.length} active, ${archivedNofos.length} archived)`);

    return {
      success: true,
      nofoData: allNofos.map(nofo => ({
        name: nofo.nofo_name,
        status: nofo.status || 'active',
        // Convert string 'true'/'false' from DynamoDB to boolean, matching S3 format
        isPinned: nofo.isPinned === 'true' || nofo.isPinned === true,
      })),
    };
  } catch (error) {
    console.error('Error fetching from DynamoDB:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fallback: Fetch NOFOs from S3 (original implementation)
 */
async function fetchFromS3(s3Bucket) {
  const s3Client = new S3Client();

  try {
    // First, get all folders in the bucket
    let allFolders = [];
    let continuationToken = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
        Delimiter: '/',
      });

      const result = await s3Client.send(command);
      
      if (result.CommonPrefixes && result.CommonPrefixes.length > 0) {
        allFolders = [...allFolders, ...result.CommonPrefixes.map(prefix => prefix.Prefix.slice(0, -1))];
      }
      
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`Found ${allFolders.length} folders in S3 bucket`);

    // Get all summary.json files
    let summaryFiles = [];
    continuationToken = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
      });

      const result = await s3Client.send(command);
      
      if (result.Contents) {
        const summaryObjects = result.Contents.filter((item) => {
          if (!item.Key.endsWith('summary.json')) return false;
          const folderName = item.Key.substring(0, item.Key.lastIndexOf('/'));
          return allFolders.includes(folderName);
        });

        summaryFiles = [...summaryFiles, ...summaryObjects.map(item => item.Key)];
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    // Read summary.json files
    let nofoData = await Promise.all(
      summaryFiles.map(async (summaryFile) => {
        const folderName = summaryFile.substring(0, summaryFile.lastIndexOf('/'));
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: summaryFile,
          });
          
          const result = await s3Client.send(getCommand);
          const fileContent = await streamToString(result.Body);
          const summary = JSON.parse(fileContent);
          
          return {
            name: folderName,
            status: summary.status || 'active',
            isPinned: summary.isPinned || false,
          };
        } catch (error) {
          console.warn(`Error reading summary for ${folderName}:`, error);
          return {
            name: folderName,
            status: 'active',
            isPinned: false,
          };
        }
      })
    );
    
    // Add folders without summary.json
    const foldersWithSummary = nofoData.map(nofo => nofo.name);
    const foldersWithoutSummary = allFolders.filter(folder => !foldersWithSummary.includes(folder));
    
    const additionalNofos = foldersWithoutSummary.map(folder => ({
      name: folder,
      status: 'active',
      isPinned: false,
    }));
    
    nofoData = [...nofoData, ...additionalNofos];
    
    console.log(`Retrieved ${nofoData.length} NOFOs from S3 (fallback)`);

    return {
      success: true,
      nofoData,
    };
  } catch (error) {
    console.error('Error fetching from S3:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';

  try {
    let nofoData = [];
    let useDynamoDB = enableDynamoDBCache && tableName;

    // Try DynamoDB first if enabled
    if (useDynamoDB) {
      const dynamoResult = await fetchFromDynamoDB(tableName);
      
      if (dynamoResult.success && dynamoResult.nofoData.length > 0) {
        nofoData = dynamoResult.nofoData;
        console.log('Successfully retrieved NOFOs from DynamoDB');
      } else {
        console.log('DynamoDB query failed or returned no results, falling back to S3');
        useDynamoDB = false;
      }
    }

    // Fallback to S3 if DynamoDB is disabled, failed, or empty
    if (!useDynamoDB) {
      const s3Result = await fetchFromS3(s3Bucket);
      
      if (s3Result.success) {
        nofoData = s3Result.nofoData;
        console.log('Successfully retrieved NOFOs from S3 (fallback)');
      } else {
        throw new Error(`Failed to fetch from both DynamoDB and S3: ${s3Result.error}`);
      }
    }

    // Filter out archived NOFOs for the landing page
    const activeNofos = nofoData.filter(nofo => nofo.status === 'active');
    console.log(`Active NOFOs: ${activeNofos.length}, Archived NOFOs: ${nofoData.length - activeNofos.length}`);

    // Return the list of folders with their status
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        // Only include active NOFOs in the folders array
        folders: activeNofos.map(nofo => nofo.name),
        // Include all NOFOs with status info for admin dashboard
        nofoData: nofoData,
      }),
    };

  } catch (error) {
    console.error('Error fetching NOFO data:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to retrieve NOFO data. Internal Server Error.',
        error: error.message,
      }),
    };
  }
};
