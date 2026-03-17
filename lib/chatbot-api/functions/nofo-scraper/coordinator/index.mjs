/**
 * Scraper Coordinator Lambda
 *
 * Paginates the Simpler.Grants.gov search API, deduplicates against DynamoDB
 * (BatchGetItem for speed), detects updated opportunities by comparing the
 * API's updated_at with stored source_updated_at, and queues SQS messages
 * (SendMessageBatch) for parallel Opportunity Processor Lambdas.
 */

import { DynamoDBClient, BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import {
  fetchOpportunityIDs,
  sleep,
  RATE_LIMIT_DELAY,
} from '../shared/utils.mjs';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const QUEUE_URL = process.env.SCRAPER_DOWNLOAD_QUEUE_URL;
const PAGE_RETRY_LIMIT = 3;

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const sqsClient = new SQSClient({ region: 'us-east-1' });

async function batchGetMetadata(titles) {
  const result = new Map();
  if (titles.length === 0) return result;

  // DynamoDB BatchGetItem supports up to 100 keys per call
  const BATCH_SIZE = 100;
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    let keysToFetch = batch.map((t) => ({ nofo_name: { S: t } }));

    while (keysToFetch.length > 0) {
      const response = await dynamoClient.send(
        new BatchGetItemCommand({
          RequestItems: {
            [METADATA_TABLE]: { Keys: keysToFetch },
          },
        })
      );

      const items = response.Responses?.[METADATA_TABLE] || [];
      for (const raw of items) {
        const item = unmarshall(raw);
        result.set(item.nofo_name, item);
      }

      keysToFetch = response.UnprocessedKeys?.[METADATA_TABLE]?.Keys || [];
      if (keysToFetch.length > 0) {
        await sleep(100);
      }
    }
  }

  return result;
}

/**
 * Send SQS messages in batches of up to 10.
 */
async function sendMessageBatch(messages) {
  const SQS_BATCH_SIZE = 10;
  for (let i = 0; i < messages.length; i += SQS_BATCH_SIZE) {
    const batch = messages.slice(i, i + SQS_BATCH_SIZE);

    await sqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: batch.map((msg) => ({
          Id: randomUUID(),
          MessageBody: JSON.stringify(msg),
        })),
      })
    );
  }
}

/**
 * Fetch a page with retries. Returns null if all retries exhausted.
 */
async function fetchPageWithRetry(pageNumber) {
  for (let attempt = 1; attempt <= PAGE_RETRY_LIMIT; attempt++) {
    try {
      return await fetchOpportunityIDs(API_KEY, pageNumber);
    } catch (err) {
      console.warn(
        `Page ${pageNumber} attempt ${attempt}/${PAGE_RETRY_LIMIT} failed: ${err.message}`
      );
      if (attempt < PAGE_RETRY_LIMIT) {
        await sleep(RATE_LIMIT_DELAY * attempt * 4);
      }
    }
  }
  return null;
}

export const handler = async (event) => {
  console.log('Scraper Coordinator started', JSON.stringify(event ?? {}).substring(0, 200));

  if (!API_KEY) throw new Error('GRANTS_GOV_API_KEY not set');
  if (!METADATA_TABLE) throw new Error('NOFO_METADATA_TABLE_NAME not set');
  if (!QUEUE_URL) throw new Error('SCRAPER_DOWNLOAD_QUEUE_URL not set');

  let totalChecked = 0;
  let newQueued = 0;
  let updatedQueued = 0;
  let skipped = 0;
  let errorCount = 0;
  let pagesSkipped = 0;
  let pageNumber = 1;

  try {
    while (true) {
      const opportunities = await fetchPageWithRetry(pageNumber);

      if (opportunities === null) {
        console.error(`Skipping page ${pageNumber} after ${PAGE_RETRY_LIMIT} failed attempts`);
        errorCount++;
        pagesSkipped++;
        pageNumber++;
        await sleep(RATE_LIMIT_DELAY * 4);
        continue;
      }

      if (opportunities.length === 0) break;
      totalChecked += opportunities.length;

      // 1. Batch-fetch all existing metadata for this page
      const titles = opportunities.map((o) => o.opportunity_title);
      let existingMap;
      try {
        existingMap = await batchGetMetadata(titles);
      } catch (err) {
        console.error(`BatchGetItem failed for page ${pageNumber}:`, err.message);
        errorCount++;
        pageNumber++;
        continue;
      }

      // 2. Classify each opportunity as new, updated, or skipped
      const toQueue = [];

      for (const opp of opportunities) {
        const oppId = opp.opportunity_id;
        const oppTitle = opp.opportunity_title;
        const apiUpdatedAt = opp.updated_at || null;

        const existing = existingMap.get(oppTitle);

        if (existing) {
          const storedUpdatedAt = existing.source_updated_at || null;
          if (apiUpdatedAt && storedUpdatedAt && apiUpdatedAt > storedUpdatedAt) {
            console.log(
              `Update detected for "${oppTitle}" — API: ${apiUpdatedAt}, stored: ${storedUpdatedAt}`
            );
            toQueue.push({
              opportunityId: oppId,
              opportunityTitle: oppTitle,
              isUpdate: true,
              apiUpdatedAt,
            });
            updatedQueued++;
          } else {
            skipped++;
          }
        } else {
          toQueue.push({
            opportunityId: oppId,
            opportunityTitle: oppTitle,
            isUpdate: false,
            apiUpdatedAt,
          });
          newQueued++;
        }
      }

      // 3. Batch-send SQS messages
      if (toQueue.length > 0) {
        try {
          await sendMessageBatch(toQueue);
        } catch (err) {
          console.error(`SendMessageBatch failed for page ${pageNumber}:`, err.message);
          errorCount++;
          newQueued -= toQueue.filter((m) => !m.isUpdate).length;
          updatedQueued -= toQueue.filter((m) => m.isUpdate).length;
        }
      }

      await sleep(RATE_LIMIT_DELAY * 2);
      pageNumber++;
    }
  } catch (err) {
    console.error('Fatal coordinator error:', err.message);
    errorCount++;
  }

  const summary = {
    totalChecked,
    newQueued,
    updatedQueued,
    skipped,
    errors: errorCount,
    pagesProcessed: pageNumber - 1,
    pagesSkipped,
  };

  console.log('Scraper Coordinator finished:', JSON.stringify(summary));

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ message: 'Scraper coordination completed', ...summary }),
  };
};
