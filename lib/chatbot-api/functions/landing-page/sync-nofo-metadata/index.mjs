/**
 * Sync NOFO Metadata Lambda Function
 * 
 * This function syncs NOFO metadata from S3 to DynamoDB.
 * It only syncs NOFOs that have been fully processed (have all required files):
 * 1. NOFO-File-PDF or NOFO-File-TXT (original document)
 * 2. summary.json (created by processAndSummarizeNOFO)
 * 3. questions.json (optional but preferred - created by processAndSummarizeNOFO)
 * 
 * This ensures only fully processed NOFOs are synced to DynamoDB.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Check if a NOFO folder has all required files (fully processed)
 */
async function isNofoFullyProcessed(s3Client, bucket, folderName) {
  const summaryFile = `${folderName}/summary.json`;
  
  // Check for original document (PDF or TXT)
  const originalFiles = [
    `${folderName}/NOFO-File-PDF`,
    `${folderName}/NOFO-File-TXT`,
  ];
  
  // Check for questions.json (optional but preferred)
  const questionsFile = `${folderName}/questions.json`;

  try {
    // Check if summary.json exists (required)
    const summaryHead = new HeadObjectCommand({
      Bucket: bucket,
      Key: summaryFile,
    });
    await s3Client.send(summaryHead);

    // Check if at least one original file exists (required)
    let hasOriginalFile = false;
    for (const file of originalFiles) {
      try {
        const head = new HeadObjectCommand({
          Bucket: bucket,
          Key: file,
        });
        await s3Client.send(head);
        hasOriginalFile = true;
        break;
      } catch (e) {
        // File doesn't exist, try next
      }
    }

    if (!hasOriginalFile) {
      return { processed: false, reason: 'Missing original document (NOFO-File-PDF or NOFO-File-TXT)' };
    }

    // Check if questions.json exists (optional but preferred)
    let hasQuestions = false;
    try {
      const questionsHead = new HeadObjectCommand({
        Bucket: bucket,
        Key: questionsFile,
      });
      await s3Client.send(questionsHead);
      hasQuestions = true;
    } catch (e) {
      // questions.json is optional, so we continue
    }

    return { 
      processed: true, 
      hasQuestions: hasQuestions,
      reason: hasQuestions ? 'All 3 files present' : 'summary.json and original file present (questions.json missing but optional)'
    };
  } catch (error) {
    return { processed: false, reason: `Missing summary.json: ${error.message}` };
  }
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
    notProcessed: 0,
    errors: 0,
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log('Starting NOFO metadata sync from S3 to DynamoDB (only fully processed NOFOs)...');

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

    // Process each folder - only sync if fully processed
    for (const folderName of allFolders) {
      stats.total++;

      try {
        // Check if NOFO is fully processed
        const processedCheck = await isNofoFullyProcessed(s3Client, s3Bucket, folderName);

        if (!processedCheck.processed) {
          stats.notProcessed++;
          console.log(`Skipping ${folderName}: ${processedCheck.reason}`);
          continue;
        }

        // Read summary.json from S3
        const summaryKey = `${folderName}/summary.json`;
        const getCommand = new GetObjectCommand({
          Bucket: s3Bucket,
          Key: summaryKey,
        });
        
        const result = await s3Client.send(getCommand);
        const fileContent = await streamToString(result.Body);
        const summary = JSON.parse(fileContent);

        // Check if item already exists in DynamoDB
        const getItemCommand = new GetItemCommand({
          TableName: tableName,
          Key: marshall({
            nofo_name: folderName,
          }),
        });

        const existingItem = await dynamoClient.send(getItemCommand);
        const now = new Date().toISOString();

        let item;
        if (existingItem.Item) {
          // Update existing item, preserve created_at
          const existing = unmarshall(existingItem.Item);
          item = {
            nofo_name: folderName,
            status: summary.status || 'active',
            isPinned: String(summary.isPinned || false),
            expiration_date: summary.application_deadline || existing.expiration_date || null,
            created_at: existing.created_at || now,
            updated_at: now,
          };
        } else {
          // Create new item
          item = {
            nofo_name: folderName,
            status: summary.status || 'active',
            isPinned: String(summary.isPinned || false),
            expiration_date: summary.application_deadline || null,
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
        console.log(`Synced ${folderName}: status=${item.status}, isPinned=${item.isPinned}, ${processedCheck.reason}`);
      } catch (error) {
        stats.errors++;
        console.error(`Error syncing ${folderName}:`, error.message);
      }
    }

    console.log('Sync completed:', stats);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'NOFO metadata sync completed (only fully processed NOFOs)',
        stats: {
          total: stats.total,
          synced: stats.synced,
          skipped: stats.skipped,
          notProcessed: stats.notProcessed,
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
