/**
 * This Lambda function is triggered by S3 PUT events for user-uploaded documents.
 * It automatically creates .metadata.json files for each uploaded document to enable
 * metadata-based filtering in Bedrock Knowledge Base.
 * After creating metadata, it automatically triggers KB sync (similar to NOFO uploads).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

// Add helper function to check if sync is running
async function isSyncRunning(kbId, dataSourceId) {
  if (!dataSourceId) return false;
  
  try {
    const { listIngestionJobs } = await import('@aws-sdk/client-bedrock-agent');
    const { BedrockAgentClient, ListIngestionJobsCommand } = await import('@aws-sdk/client-bedrock-agent');
    const agentClient = new BedrockAgentClient({ region: 'us-east-1' });
    
    const inProgress = await agentClient.send(new ListIngestionJobsCommand({
      dataSourceId: dataSourceId,
      knowledgeBaseId: kbId,
      filters: [{
        attribute: 'STATUS',
        operator: 'EQ',
        values: ['IN_PROGRESS', 'STARTING']
      }]
    }));
    
    return (inProgress.ingestionJobSummaries?.length || 0) > 0;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false; // If check fails, allow sync to proceed
  }
}

export const handler = async (event) => {
  console.log('Metadata creation Lambda triggered:', JSON.stringify(event, null, 2));

  let metadataCreatedForUserDocs = false;
  let metadataCreatedForNofos = false;

  for (const record of event.Records || []) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      // Skip if this is already a metadata file or other system files
      if (key.endsWith('.metadata.json') || 
          key.endsWith('summary.json') || 
          key.endsWith('questions.json') ||
          key.includes('.metadata.json')) {
        console.log(`Skipping metadata file creation for: ${key}`);
        continue;
      }

      // Determine document type based on bucket
      const isUserDocumentsBucket = bucket === process.env.USER_DOCUMENTS_BUCKET;
      let metadata;

      if (isUserDocumentsBucket) {
        // User documents bucket: format is userId/nofoName/filename
        const pathParts = key.split('/');
        if (pathParts.length < 3) {
          console.log(`Invalid path format for user document, skipping: ${key}`);
          continue;
        }

        const userId = pathParts[0];
        const nofoName = pathParts[1];
        const fileName = pathParts.slice(2).join('/');

        metadata = {
          metadataAttributes: {
            documentType: 'userDocument',
            userId: userId,
            nofoName: nofoName,
            bucket: 'userDocuments',
            fileName: fileName,
            uploadedAt: new Date().toISOString()
          }
        };
      } else {
        // NOFO bucket: format is documentIdentifier/NOFO-File-PDF or documentIdentifier/NOFO-File-TXT
        // Extract documentIdentifier (folder path)
        const lastSlashIndex = key.lastIndexOf('/');
        if (lastSlashIndex === -1) {
          console.log(`Invalid NOFO path format, skipping: ${key}`);
          continue;
        }

        const documentIdentifier = key.substring(0, lastSlashIndex);
        const fileName = key.substring(lastSlashIndex + 1);

        // Only create metadata for actual NOFO files (PDF or TXT)
        if (!fileName.startsWith('NOFO-File-')) {
          console.log(`Skipping non-NOFO file: ${key}`);
          continue;
        }

        // Fetch agency and category from DynamoDB if available
        let agency = null;
        let category = null;
        const tableName = process.env.NOFO_METADATA_TABLE_NAME;
        const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
        
        if (enableDynamoDBCache && tableName) {
          try {
            const getCommand = new GetItemCommand({
              TableName: tableName,
              Key: marshall({ nofo_name: documentIdentifier }),
            });
            const existingItem = await dynamoClient.send(getCommand);
            
            if (existingItem.Item) {
              const existing = unmarshall(existingItem.Item);
              agency = existing.agency || null;
              category = existing.category || null;
              console.log(`Fetched agency=${agency}, category=${category} from DynamoDB for ${documentIdentifier}`);
            }
          } catch (error) {
            console.warn(`Could not fetch agency/category from DynamoDB for ${documentIdentifier}:`, error.message);
            // Continue without agency/category
          }
        }

        metadata = {
          metadataAttributes: {
            documentType: 'NOFO',
            documentIdentifier: documentIdentifier,
            bucket: 'nofo',
            fileName: fileName,
            processedAt: new Date().toISOString()
          }
        };
        
        // Add agency and category to metadata if available
        if (agency) {
          metadata.metadataAttributes.agency = agency;
        }
        if (category) {
          metadata.metadataAttributes.category = category;
        }
      }

      // Create metadata file path: originalKey.metadata.json
      const metadataKey = `${key}.metadata.json`;

      // Check if metadata file already exists (avoid overwriting)
      try {
        await s3Client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: metadataKey
        }));
        console.log(`Metadata file already exists, skipping: ${metadataKey}`);
        continue;
      } catch (error) {
        // File doesn't exist, proceed to create it
        if (error.name !== 'NoSuchKey') {
          throw error;
        }
      }

      // Upload metadata file
      const metadataParams = {
        Bucket: bucket,
        Key: metadataKey,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: 'application/json',
      };

      await s3Client.send(new PutObjectCommand(metadataParams));
      console.log(`Successfully created metadata file: ${metadataKey}`);

      // Track which type of metadata was created for KB sync
      if (isUserDocumentsBucket) {
        metadataCreatedForUserDocs = true;
      } else {
        metadataCreatedForNofos = true;
      }

    } catch (error) {
      console.error(`Error processing record: ${JSON.stringify(record)}`, error);
      // Continue processing other records even if one fails
    }
  }

  // Automatically trigger KB sync after creating metadata
  // Only sync if we actually created metadata files AND sync is not already running
  if ((metadataCreatedForUserDocs || metadataCreatedForNofos) && process.env.SYNC_KB_FUNCTION_NAME) {
    try {
      // Check if sync is already running before triggering
      const kbId = process.env.KB_ID;
      const userDocsSource = process.env.USER_DOCUMENTS_SOURCE;
      const nofoSource = process.env.SOURCE;
      
      const userDocsRunning = userDocsSource ? await isSyncRunning(kbId, userDocsSource) : false;
      const nofoRunning = nofoSource ? await isSyncRunning(kbId, nofoSource) : false;
      
      if (userDocsRunning || nofoRunning) {
        console.log('KB sync already in progress, skipping trigger');
      } else {
        console.log('Triggering KB sync after metadata creation...');
        const invokeCommand = new InvokeCommand({
          FunctionName: process.env.SYNC_KB_FUNCTION_NAME,
          InvocationType: 'Event',
        });
        await lambdaClient.send(invokeCommand);
        console.log('KB sync triggered successfully');
      }
    } catch (error) {
      console.error('Failed to invoke syncKBFunction:', error);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ 
      message: 'Metadata files processed',
      kbSyncTriggered: (metadataCreatedForUserDocs || metadataCreatedForNofos) && !!process.env.SYNC_KB_FUNCTION_NAME
    })
  };
};

