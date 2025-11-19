/**
 * This Lambda function is triggered by S3 PUT events for user-uploaded documents.
 * It automatically creates .metadata.json files for each uploaded document to enable
 * metadata-based filtering in Bedrock Knowledge Base.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('Metadata creation Lambda triggered:', JSON.stringify(event, null, 2));

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

        metadata = {
          metadataAttributes: {
            documentType: 'NOFO',
            documentIdentifier: documentIdentifier,
            bucket: 'nofo',
            fileName: fileName,
            processedAt: new Date().toISOString()
          }
        };
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

    } catch (error) {
      console.error(`Error processing record: ${JSON.stringify(record)}`, error);
      // Continue processing other records even if one fails
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Metadata files processed' })
  };
};

