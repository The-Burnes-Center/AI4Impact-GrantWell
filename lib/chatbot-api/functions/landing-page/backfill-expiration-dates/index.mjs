/**
 * Backfill Expiration Dates Lambda Function
 * 
 * One-time script to re-extract expiration dates from ALL NOFOs in the system.
 * - Scans all NOFO folders in S3
 * - Extracts application deadline from KeyDeadlines using Bedrock
 * - Updates if: no existing date OR new date is later than existing
 * - Reactivates archived NOFOs if they get a new/later deadline
 * 
 * This should be run manually via API Gateway or Lambda console.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
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
 * Extract application deadline date from KeyDeadlines array using Bedrock
 */
async function extractApplicationDeadline(keyDeadlines, bedrockClient) {
  if (!keyDeadlines || keyDeadlines.length === 0) {
    return null;
  }

  try {
    const deadlineText = keyDeadlines
      .map(d => `${d.item}: ${d.description}`)
      .join('\n');

    const prompt = `# Date Extraction Assistant: Application Submission Deadline

## CONTEXT

You are a specialized date extraction assistant. Your task is to identify and extract ONLY the application submission deadline from the provided text, converting it to a standardized format.

## INPUT TEXT

<deadline_text>${deadlineText}</deadline_text>

## TASK DEFINITION

Extract the application submission deadline from the input text. You must ignore other types of dates such as:

- Letters of intent deadlines

- Notification dates

- Award start dates

- Any other non-submission deadlines

## EXTRACTION RULES

1. **Focus only on the final application submission deadline**

2. **Date format requirements:**

   - Output must be in ISO 8601 format: \`YYYY-MM-DDTHH:mm:ssZ\` in UTC timezone

   - Example: \`2023-12-31T23:59:59Z\`

3. **Time handling:**

   - If specific time is mentioned: Use the exact time provided

   - If no time is specified: Default to \`23:59:59\` (end of day)

4. **Timezone conversion:**

   - If timezone is explicitly stated: Convert the time to UTC

   - If no timezone is specified: Assume US Eastern Time (ET), then convert to UTC

5. **Fallback priority:**

   - If you cannot identify an application submission deadline: Use the next priority date in this order:
     1. Letter of Intent deadline
     2. Pre-application deadline
     3. Notification date
     4. Award start date
     5. Any other deadline date found
   - Only return \`null\` if absolutely no dates are found in the text

## OUTPUT FORMAT

Return ONLY the ISO 8601 string or \`null\`. Do not include any explanations, JSON formatting, or additional text.

Provide your extracted deadline immediately without any preamble, enclosed in <response></response> tags.`;

    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    const response = await bedrockClient.send(command);
    let content = JSON.parse(
      new TextDecoder().decode(response.body)
    ).content[0].text.trim();

    // Extract content from <response></response> tags if present
    const responseMatch = content.match(/<response>(.*?)<\/response>/s);
    if (responseMatch) {
      content = responseMatch[1].trim();
    }

    if (content.toLowerCase() === 'null' || !content) {
      return null;
    }

    const date = new Date(content);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    console.error('Error extracting application deadline:', error);
    return null;
  }
}

/**
 * Get current NOFO metadata from DynamoDB
 */
async function getNofoMetadata(tableName, dynamoClient, nofoName) {
  try {
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName }),
    });
    
    const result = await dynamoClient.send(getCommand);
    return result.Item ? unmarshall(result.Item) : null;
  } catch (error) {
    console.error(`Error getting metadata for ${nofoName}:`, error);
    return null;
  }
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const dryRun = process.env.DRY_RUN === 'true';
  
  const s3Client = new S3Client();
  const dynamoClient = new DynamoDBClient();
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

  const stats = {
    totalProcessed: 0,
    updated: 0,
    reactivated: 0,
    skippedNoSummary: 0,
    skippedNoDeadlines: 0,
    skippedNoUpdateNeeded: 0,
    errors: 0,
    errorList: [],
    updatedNofos: [],
    reactivatedNofos: [],
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log(`Starting backfill (dryRun: ${dryRun})...`);
    console.log(`S3 Bucket: ${s3Bucket}`);
    console.log(`DynamoDB Table: ${tableName}`);

    // Step 1: List all NOFO folders from S3 (comprehensive source)
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

    console.log(`Found ${allFolders.length} NOFO folders in S3`);

    // Step 2: Process each folder
    for (const folderName of allFolders) {
      stats.totalProcessed++;

      try {
        console.log(`\n[${stats.totalProcessed}/${allFolders.length}] Processing: ${folderName}`);

        // Read summary.json from S3
        const summaryKey = `${folderName}/summary.json`;
        let summary;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: summaryKey,
          });
          
          const result = await s3Client.send(getCommand);
          const fileContent = await streamToString(result.Body);
          summary = JSON.parse(fileContent);
        } catch (error) {
          if (error.name === 'NoSuchKey') {
            console.log(`  Skipping: No summary.json`);
            stats.skippedNoSummary++;
            continue;
          }
          throw error;
        }

        // Check if KeyDeadlines exists
        if (!summary.KeyDeadlines || summary.KeyDeadlines.length === 0) {
          console.log(`  Skipping: No KeyDeadlines in summary`);
          stats.skippedNoDeadlines++;
          continue;
        }

        // Get current metadata from DynamoDB
        const currentMetadata = await getNofoMetadata(tableName, dynamoClient, folderName);
        const existingExpirationDate = currentMetadata?.expiration_date || null;
        const currentStatus = currentMetadata?.status || 'active';

        console.log(`  Current status: ${currentStatus}, Existing expiration: ${existingExpirationDate || 'none'}`);

        // Extract application deadline using Bedrock
        console.log(`  Extracting deadline from KeyDeadlines...`);
        const extractedDeadline = await extractApplicationDeadline(
          summary.KeyDeadlines,
          bedrockClient
        );

        if (!extractedDeadline) {
          console.log(`  Skipping: Could not extract deadline from KeyDeadlines`);
          stats.skippedNoDeadlines++;
          continue;
        }

        console.log(`  Extracted deadline: ${extractedDeadline}`);

        // Determine if we need to update
        let shouldUpdate = false;
        
        if (!existingExpirationDate) {
          // No existing date, update it
          shouldUpdate = true;
          console.log(`  Update needed: No existing expiration date`);
        } else {
          // Compare dates - update if new date is later
          const existingDate = new Date(existingExpirationDate);
          const newDate = new Date(extractedDeadline);
          
          if (newDate > existingDate) {
            shouldUpdate = true;
            console.log(`  Update needed: New date is later (${extractedDeadline} > ${existingExpirationDate})`);
          } else {
            console.log(`  No update needed: Existing date is same or later`);
            stats.skippedNoUpdateNeeded++;
          }
        }

        if (!shouldUpdate) {
          continue;
        }

        // Determine if we need to reactivate
        const needsReactivation = currentStatus === 'archived';

        if (!dryRun) {
          // Update summary.json in S3
          summary.application_deadline = extractedDeadline;
          if (needsReactivation) {
            summary.status = 'active';
          }
          
          const putCommand = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: summaryKey,
            Body: JSON.stringify(summary, null, 2),
            ContentType: 'application/json',
          });
          await s3Client.send(putCommand);

          // Update DynamoDB
          const now = new Date().toISOString();
          const updateExpressionParts = [
            'expiration_date = :expiration_date',
            '#updated_at = :updated_at'
          ];
          const expressionAttributeNames = {
            '#updated_at': 'updated_at',
          };
          const expressionAttributeValues = {
            ':expiration_date': extractedDeadline,
            ':updated_at': now,
          };

          // If archived, also update status to active
          if (needsReactivation) {
            updateExpressionParts.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = 'active';
          }

          const updateCommand = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall({
              nofo_name: folderName,
            }),
            UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: marshall(expressionAttributeValues),
          });

          await dynamoClient.send(updateCommand);
          
          stats.updated++;
          stats.updatedNofos.push(folderName);
          
          if (needsReactivation) {
            stats.reactivated++;
            stats.reactivatedNofos.push(folderName);
            console.log(`  ✓ Updated and REACTIVATED`);
          } else {
            console.log(`  ✓ Updated`);
          }
        } else {
          const reactivationMsg = needsReactivation ? ' (would reactivate)' : '';
          console.log(`  [DRY RUN] Would update${reactivationMsg}`);
          stats.updated++;
          stats.updatedNofos.push(folderName);
          if (needsReactivation) {
            stats.reactivated++;
            stats.reactivatedNofos.push(folderName);
          }
        }

        // Rate limiting - wait 1 second between Bedrock requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        stats.errors++;
        stats.errorList.push({
          folder: folderName,
          error: error.message,
        });
        console.error(`  ✗ Error: ${error.message}`);
      }
    }

    console.log('\n========================================');
    console.log('BACKFILL COMPLETED');
    console.log('========================================');
    console.log(`Total processed: ${stats.totalProcessed}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Reactivated: ${stats.reactivated}`);
    console.log(`Skipped (no summary): ${stats.skippedNoSummary}`);
    console.log(`Skipped (no deadlines): ${stats.skippedNoDeadlines}`);
    console.log(`Skipped (no update needed): ${stats.skippedNoUpdateNeeded}`);
    console.log(`Errors: ${stats.errors}`);
    
    if (stats.reactivatedNofos.length > 0) {
      console.log('\nReactivated NOFOs:');
      stats.reactivatedNofos.forEach(name => console.log(`  - ${name}`));
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: dryRun ? 'Dry run completed' : 'Backfill completed',
        stats: {
          totalProcessed: stats.totalProcessed,
          updated: stats.updated,
          reactivated: stats.reactivated,
          skippedNoSummary: stats.skippedNoSummary,
          skippedNoDeadlines: stats.skippedNoDeadlines,
          skippedNoUpdateNeeded: stats.skippedNoUpdateNeeded,
          errors: stats.errors,
        },
        updatedNofos: stats.updatedNofos,
        reactivatedNofos: stats.reactivatedNofos,
        errorList: stats.errorList,
      }),
    };

  } catch (error) {
    console.error('Error during backfill:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to backfill expiration dates',
        error: error.message,
        stats,
      }),
    };
  }
};
