/**
 * Sync NOFO Metadata Lambda Function
 * 
 * This function syncs NOFO metadata from S3 to DynamoDB.
 * It reads all summary.json files from S3 and writes/updates the corresponding entries in DynamoDB.
 * This is useful for initial migration and periodic sync to ensure consistency.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
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

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const s3Client = new S3Client();
  const dynamoClient = new DynamoDBClient();

  const stats = {
    total: 0,
    synced: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log('Starting NOFO metadata sync from S3 to DynamoDB...');

    // Get all folders in the bucket
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

    console.log(`Found ${summaryFiles.length} summary.json files`);

    // Process each summary.json file
    for (const summaryFile of summaryFiles) {
      const nofoName = summaryFile.substring(0, summaryFile.lastIndexOf('/'));
      stats.total++;

      try {
        // Read summary.json from S3
        const getCommand = new GetObjectCommand({
          Bucket: s3Bucket,
          Key: summaryFile,
        });
        
        const result = await s3Client.send(getCommand);
        const fileContent = await streamToString(result.Body);
        const summary = JSON.parse(fileContent);

        // Check if item already exists in DynamoDB
        const getItemCommand = new GetItemCommand({
          TableName: tableName,
          Key: marshall({
            nofo_name: nofoName,
          }),
        });

        const existingItem = await dynamoClient.send(getItemCommand);
        const now = new Date().toISOString();

        let item;
        if (existingItem.Item) {
          // Update existing item, preserve created_at
          const existing = unmarshall(existingItem.Item);
          item = {
            nofo_name: nofoName,
            status: summary.status || 'active',
            isPinned: String(summary.isPinned || false),
            created_at: existing.created_at || now,
            updated_at: now,
          };
        } else {
          // Create new item
          item = {
            nofo_name: nofoName,
            status: summary.status || 'active',
            isPinned: String(summary.isPinned || false),
            created_at: now,
            updated_at: now,
          };
        }

        // Write to DynamoDB
        const putCommand = new PutItemCommand({
          TableName: tableName,
          Item: marshall(item),
        });

        await dynamoClient.send(putCommand);
        stats.synced++;
        console.log(`Synced ${nofoName}: status=${item.status}, isPinned=${item.isPinned}`);
      } catch (error) {
        stats.errors++;
        console.error(`Error syncing ${nofoName}:`, error.message);
      }
    }

    // Handle folders without summary.json files
    const foldersWithSummary = summaryFiles.map(file => file.substring(0, file.lastIndexOf('/')));
    const foldersWithoutSummary = allFolders.filter(folder => !foldersWithSummary.includes(folder));

    console.log(`Found ${foldersWithoutSummary.length} folders without summary.json`);

    for (const folderName of foldersWithoutSummary) {
      stats.total++;

      try {
        // Check if item already exists
        const getItemCommand = new GetItemCommand({
          TableName: tableName,
          Key: marshall({
            nofo_name: folderName,
          }),
        });

        const existingItem = await dynamoClient.send(getItemCommand);
        const now = new Date().toISOString();

        // Only create if it doesn't exist (to avoid overwriting)
        if (!existingItem.Item) {
          const item = {
            nofo_name: folderName,
            status: 'active',
            isPinned: 'false',
            created_at: now,
            updated_at: now,
          };

          const putCommand = new PutItemCommand({
            TableName: tableName,
            Item: marshall(item),
          });

          await dynamoClient.send(putCommand);
          stats.synced++;
          console.log(`Created default entry for ${folderName}`);
        } else {
          stats.skipped++;
          console.log(`Skipped ${folderName}: already exists in DynamoDB`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`Error creating default entry for ${folderName}:`, error.message);
      }
    }

    console.log('Sync completed:', stats);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'NOFO metadata sync completed',
        stats: {
          total: stats.total,
          synced: stats.synced,
          skipped: stats.skipped,
          errors: stats.errors,
        },
      }),
    };

  } catch (error) {
    console.error('Error during sync:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to sync NOFO metadata',
        error: error.message,
        stats,
      }),
    };
  }
};

