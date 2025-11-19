/**
 * This Lambda function backfills metadata files for existing NOFO documents
 * in the S3 bucket. It scans all NOFO files and creates .metadata.json files
 * for those that don't already have them.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'us-east-1' });

export const handler = async (event) => {
  const nofoBucket = process.env.NOFO_BUCKET || process.env.BUCKET;
  
  if (!nofoBucket) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'NOFO_BUCKET environment variable not set' })
    };
  }

  const stats = {
    totalNofos: 0,
    metadataCreated: 0,
    metadataSkipped: 0,
    errors: 0,
    errorsList: []
  };

  try {
    console.log(`Starting metadata backfill for NOFO bucket: ${nofoBucket}`);

    // List all objects in the bucket
    let allObjects = [];
    let continuationToken = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: nofoBucket,
        ContinuationToken: continuationToken,
      });

      const result = await s3Client.send(command);
      
      if (result.Contents) {
        allObjects = [...allObjects, ...result.Contents];
      }
      
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`Found ${allObjects.length} total objects in bucket`);

    // Filter for NOFO files (PDF or TXT)
    const nofoFiles = allObjects.filter(obj => {
      const key = obj.Key;
      const fileName = key.substring(key.lastIndexOf('/') + 1);
      
      // Only process NOFO-File-PDF and NOFO-File-TXT
      // Skip metadata files, summary.json, questions.json, and other system files
      return fileName.startsWith('NOFO-File-') && 
             !key.endsWith('.metadata.json') &&
             !key.endsWith('summary.json') &&
             !key.endsWith('questions.json');
    });

    console.log(`Found ${nofoFiles.length} NOFO files to process`);

    // Process each NOFO file
    for (const nofoFile of nofoFiles) {
      try {
        const key = nofoFile.Key;
        const lastSlashIndex = key.lastIndexOf('/');
        
        if (lastSlashIndex === -1) {
          console.log(`Invalid NOFO path format, skipping: ${key}`);
          stats.errors++;
          stats.errorsList.push({
            key: key,
            error: 'Invalid path format'
          });
          continue;
        }
        
        const documentIdentifier = key.substring(0, lastSlashIndex);
        const fileName = key.substring(lastSlashIndex + 1);
        const metadataKey = `${key}.metadata.json`;

        stats.totalNofos++;

        // Check if metadata file already exists
        try {
          await s3Client.send(new GetObjectCommand({
            Bucket: nofoBucket,
            Key: metadataKey
          }));
          console.log(`Metadata already exists for: ${key}`);
          stats.metadataSkipped++;
          continue;
        } catch (error) {
          if (error.name !== 'NoSuchKey') {
            throw error;
          }
          // File doesn't exist, proceed to create it
        }

        // Create metadata
        const metadata = {
          metadataAttributes: {
            documentType: 'NOFO',
            documentIdentifier: documentIdentifier,
            bucket: 'nofo',
            fileName: fileName,
            processedAt: new Date().toISOString(),
            backfilled: true // Flag to indicate this was backfilled
          }
        };

        // Upload metadata file
        const metadataParams = {
          Bucket: nofoBucket,
          Key: metadataKey,
          Body: JSON.stringify(metadata, null, 2),
          ContentType: 'application/json',
        };

        await s3Client.send(new PutObjectCommand(metadataParams));
        console.log(`Created metadata for: ${key}`);
        stats.metadataCreated++;

      } catch (error) {
        console.error(`Error processing ${nofoFile.Key}:`, error);
        stats.errors++;
        stats.errorsList.push({
          key: nofoFile.Key,
          error: error.message
        });
      }
    }

    console.log('Backfill completed:', stats);

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Metadata backfill completed',
        stats: stats
      })
    };

    return response;

  } catch (error) {
    console.error('Backfill failed:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Backfill failed',
        message: error.message,
        stats: stats
      })
    };
  }
};

