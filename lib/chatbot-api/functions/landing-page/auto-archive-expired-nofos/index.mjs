/**
 * Auto-Archive Expired NOFOs Lambda Function
 * 
 * This function runs on a schedule (daily) to automatically archive NOFOs
 * whose application deadline has passed. It includes a grace period (default 1 day)
 * to account for timezone differences and processing delays.
 * 
 * Only archives NOFOs that:
 * - Have status = 'active'
 * - Have a valid expiration_date
 * - expiration_date + grace period < current date
 */

import { DynamoDBClient, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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
 * Archive a NOFO in DynamoDB
 */
async function archiveNofoInDynamoDB(dynamoClient, tableName, nofoName) {
  const now = new Date().toISOString();
  
  const updateCommand = new UpdateItemCommand({
    TableName: tableName,
    Key: marshall({
      nofo_name: nofoName,
    }),
    UpdateExpression: 'SET #status = :status, #updated_at = :updated_at',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updated_at': 'updated_at',
    },
    ExpressionAttributeValues: marshall({
      ':status': 'archived',
      ':updated_at': now,
    }),
  });

  await dynamoClient.send(updateCommand);
  console.log(`Archived ${nofoName} in DynamoDB`);
}

/**
 * Archive a NOFO in S3 summary.json
 */
async function archiveNofoInS3(s3Client, bucket, nofoName) {
  const summaryKey = `${nofoName}/summary.json`;
  
  try {
    // Read existing summary.json
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: summaryKey,
    });
    
    const result = await s3Client.send(getCommand);
    const fileContent = await streamToString(result.Body);
    const summary = JSON.parse(fileContent);
    
    // Update status
    summary.status = 'archived';
    
    // Write back to S3
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: summaryKey,
      Body: JSON.stringify(summary, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    console.log(`Archived ${nofoName} in S3`);
  } catch (error) {
    console.error(`Error archiving ${nofoName} in S3:`, error);
    throw error;
  }
}

export const handler = async (event) => {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const s3Bucket = process.env.BUCKET;
  const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS || '1', 10); // Default 1 day
  const dryRun = process.env.DRY_RUN === 'true'; // For testing
  
  const dynamoClient = new DynamoDBClient();
  const s3Client = new S3Client();
  
  const stats = {
    totalChecked: 0,
    archived: 0,
    skippedNoDate: 0,
    skippedNotExpired: 0,
    errors: 0,
    errorList: [],
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log(`Starting auto-archive process (dryRun: ${dryRun}, gracePeriod: ${gracePeriodDays} days)...`);

    // Calculate cutoff date (current date - grace period)
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);
    const cutoffDateISO = cutoffDate.toISOString();

    console.log(`Cutoff date: ${cutoffDateISO} (NOFOs with expiration_date before this will be archived)`);

    // Query all active NOFOs using StatusIndex
    let lastEvaluatedKey = null;
    let allActiveNofos = [];

    do {
      const queryParams = {
        TableName: tableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':status': 'active',
        }),
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamoClient.send(queryCommand);
      
      if (result.Items) {
        allActiveNofos = [...allActiveNofos, ...result.Items.map(item => unmarshall(item))];
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Found ${allActiveNofos.length} active NOFOs to check`);

    // Process each active NOFO
    for (const nofo of allActiveNofos) {
      stats.totalChecked++;

      try {
        // Skip if no expiration_date
        if (!nofo.expiration_date) {
          stats.skippedNoDate++;
          console.log(`Skipping ${nofo.nofo_name}: No expiration_date`);
          continue;
        }

        // Check if expired (with grace period)
        const expirationDate = new Date(nofo.expiration_date);
        if (expirationDate >= cutoffDate) {
          stats.skippedNotExpired++;
          console.log(`Skipping ${nofo.nofo_name}: Not expired yet (expires: ${nofo.expiration_date})`);
          continue;
        }

        // Archive the NOFO
        console.log(`Archiving ${nofo.nofo_name} (expired: ${nofo.expiration_date})`);
        
        if (!dryRun) {
          // Archive in DynamoDB
          await archiveNofoInDynamoDB(dynamoClient, tableName, nofo.nofo_name);
          
          // Archive in S3
          await archiveNofoInS3(s3Client, s3Bucket, nofo.nofo_name);
          
          stats.archived++;
        } else {
          console.log(`[DRY RUN] Would archive ${nofo.nofo_name}`);
          stats.archived++;
        }
      } catch (error) {
        stats.errors++;
        stats.errorList.push({
          nofo: nofo.nofo_name,
          error: error.message,
        });
        console.error(`Error processing ${nofo.nofo_name}:`, error);
      }
    }

    console.log('Auto-archive completed:', stats);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: dryRun ? 'Dry run completed' : 'Auto-archive completed',
        stats,
        cutoffDate: cutoffDateISO,
        gracePeriodDays,
      }),
    };

  } catch (error) {
    console.error('Error during auto-archive:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to auto-archive expired NOFOs',
        error: error.message,
        stats,
      }),
    };
  }
};

