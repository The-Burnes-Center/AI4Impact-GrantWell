/**
 * DOCX to Text Converter Lambda Function
 *
 * Triggered by S3 ObjectCreated events on keys ending with "NOFO-File-DOCX".
 * Extracts plain text from the DOCX using mammoth, writes it as "NOFO-File-TXT"
 * to the same S3 prefix, then deletes the original DOCX.
 * The new TXT file triggers the existing NOFO processing pipeline (SQS → Step Functions).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));

  for (const record of event.Records || []) {
    try {
      const s3Event = record.s3 || {};
      const bucket = s3Event.bucket?.name;
      // Decode key — S3 URL-encodes object keys in event notifications
      const docxKey = decodeURIComponent(
        (s3Event.object?.key || '').replace(/\+/g, ' ')
      );

      if (!docxKey.endsWith('NOFO-File-DOCX')) {
        console.log(`Skipping ${docxKey}: not a NOFO-File-DOCX key`);
        continue;
      }

      console.log(`Processing DOCX: ${docxKey}`);

      // Download DOCX from S3
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: docxKey })
      );
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const docxBuffer = Buffer.concat(chunks);
      console.log(`Downloaded DOCX, size: ${docxBuffer.length} bytes`);

      // Extract plain text using mammoth
      const { value: text, messages } = await mammoth.extractRawText({
        buffer: docxBuffer,
      });
      if (messages && messages.length > 0) {
        console.log('mammoth messages:', JSON.stringify(messages));
      }
      console.log(`Extracted text length: ${text.length} characters`);

      if (!text || text.trim().length === 0) {
        console.warn(`Empty text extracted from ${docxKey} — skipping`);
        continue;
      }

      // Write extracted text as NOFO-File-TXT (triggers existing pipeline)
      const txtKey = docxKey.replace('NOFO-File-DOCX', 'NOFO-File-TXT');
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: txtKey,
          Body: text,
          ContentType: 'text/plain',
        })
      );
      console.log(`Written TXT: ${txtKey}`);

      // Delete the original DOCX
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: docxKey })
      );
      console.log(`Deleted DOCX: ${docxKey}`);
    } catch (error) {
      console.error(`Error processing record: ${error.message}`, error);
      // Don't rethrow — continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'DOCX to text conversion completed' }),
  };
};
