/**
 * Backfill Expiration Dates Lambda Function
 * 
 * This is a one-time script to extract expiration dates from existing NOFOs
 * that don't have application_deadline set. It reads summary.json files,
 * extracts dates from KeyDeadlines, and updates both S3 and DynamoDB.
 * 
 * This should be run manually via API Gateway or Lambda console.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall } from '@aws-sdk/util-dynamodb';

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
 * Extract application deadline date from KeyDeadlines array
 * Same logic as in processAndSummarizeNOFO
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

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const dryRun = process.env.DRY_RUN === 'FALSE';
  
  const s3Client = new S3Client();
  const dynamoClient = new DynamoDBClient();
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

  const stats = {
    totalProcessed: 0,
    updated: 0,
    skippedNoDeadlines: 0,
    skippedAlreadyHasDate: 0,
    errors: 0,
    errorList: [],
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log(`Starting backfill (dryRun: ${dryRun})...`);

    // Get all folders in S3
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

    console.log(`Found ${allFolders.length} NOFO folders to process`);

    // Process each folder
    for (const folderName of allFolders) {
      stats.totalProcessed++;

      try {
        // Read summary.json
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
            console.log(`Skipping ${folderName}: No summary.json`);
            continue;
          }
          throw error;
        }

        // Skip if already has application_deadline
        if (summary.application_deadline) {
          stats.skippedAlreadyHasDate++;
          console.log(`Skipping ${folderName}: Already has application_deadline`);
          continue;
        }

        // Skip if no KeyDeadlines
        if (!summary.KeyDeadlines || summary.KeyDeadlines.length === 0) {
          stats.skippedNoDeadlines++;
          console.log(`Skipping ${folderName}: No KeyDeadlines`);
          continue;
        }

        // Extract application deadline
        console.log(`Extracting deadline for ${folderName}...`);
        const applicationDeadline = await extractApplicationDeadline(
          summary.KeyDeadlines,
          bedrockClient
        );

        if (!applicationDeadline) {
          stats.skippedNoDeadlines++;
          console.log(`Skipping ${folderName}: Could not extract deadline`);
          continue;
        }

        console.log(`Found deadline for ${folderName}: ${applicationDeadline}`);

        if (!dryRun) {
          // Update summary.json in S3
          summary.application_deadline = applicationDeadline;
          const putCommand = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: summaryKey,
            Body: JSON.stringify(summary, null, 2),
            ContentType: 'application/json',
          });
          await s3Client.send(putCommand);

          // Update DynamoDB
          const now = new Date().toISOString();
          const updateCommand = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall({
              nofo_name: folderName,
            }),
            UpdateExpression: 'SET expiration_date = :expiration_date, #updated_at = :updated_at',
            ExpressionAttributeNames: {
              '#updated_at': 'updated_at',
            },
            ExpressionAttributeValues: marshall({
              ':expiration_date': applicationDeadline,
              ':updated_at': now,
            }),
          });

          await dynamoClient.send(updateCommand);
          stats.updated++;
          console.log(`Updated ${folderName}`);
        } else {
          console.log(`[DRY RUN] Would update ${folderName} with deadline: ${applicationDeadline}`);
          stats.updated++;
        }

        // Rate limiting - wait 1 second between requests to avoid overwhelming Bedrock
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        stats.errors++;
        stats.errorList.push({
          folder: folderName,
          error: error.message,
        });
        console.error(`Error processing ${folderName}:`, error);
      }
    }

    console.log('Backfill completed:', stats);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: dryRun ? 'Dry run completed' : 'Backfill completed',
        stats,
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

