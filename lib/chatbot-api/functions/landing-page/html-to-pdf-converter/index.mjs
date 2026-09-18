/**
 * HTML to PDF Converter Lambda Function
 * 
 * This function is triggered by S3 events when HTML files are uploaded to the
 * pending-conversion/ prefix. It converts HTML files to PDF format using Puppeteer
 * and Chromium, then uploads them to the final location and deletes the temporary HTML file.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.BUCKET;
const REVIEW_TABLE_NAME = process.env.REVIEW_TABLE_NAME;

const STUB_MAX_BYTES = 4096;
const META_REFRESH_RE =
  /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']\s*(\d+)\s*;\s*url\s*=\s*['"]?([^'"\s>]+)/i;

/** Redirect stub: Chromium follows the refresh mid-render, so these never convert. */
function detectRedirectStub(html) {
  if (Buffer.byteLength(html) > STUB_MAX_BYTES) return null;
  const match = html.match(META_REFRESH_RE);
  if (!match) return null;
  if (Number(match[1]) > 2) return null;
  const bodyText = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '')
    .replace(/<[^>]*>/g, '')
    .trim();
  if (bodyText.length > 0) return null;
  return { redirectTarget: match[2] };
}

/** Never throws: a failed flag must not also lose the S3 cleanup decision. */
async function flagForReview(nofoName, errorMessage) {
  if (!REVIEW_TABLE_NAME) {
    console.error(`REVIEW_TABLE_NAME is not configured; ${nofoName} failed silently: ${errorMessage}`);
    return false;
  }
  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: REVIEW_TABLE_NAME,
        Item: marshall(
          {
            nofo_name: nofoName,
            review_id: randomUUID(),
            status: 'pending_review',
            created_at: new Date().toISOString(),
            source: 'scraper-dlq',
            errorMessage,
            extractedSummary: null,
            extractedQuestions: null,
            validationResult: null,
            qualityScore: 0,
            retryCount: 0,
            s3DocumentKey: '',
            s3RawTextKey: '',
            documentTextPreview: '',
            reviewed_by: null,
            reviewed_at: null,
            admin_notes: null,
            corrections: null,
            adminGuidance: null,
          },
          { removeUndefinedValues: true }
        ),
      })
    );
    console.log(`Flagged ${nofoName} for review: ${errorMessage}`);
    return true;
  } catch (error) {
    console.error(`Could not flag ${nofoName} for review: ${error.message}`, error);
    return false;
  }
}

/**
 * Generate PDF buffer from HTML content using Puppeteer/Chromium
 */
const generatePdfBuffer = async (html) => {
  let browser = null;
  try {
    console.log('Launching browser');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log('Browser launched');
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0', 'load'],
    });
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    const pdfBuffer = await page.pdf({ format: 'a4', printBackground: true });
    return pdfBuffer;
  } catch (e) {
    console.error('Chromium error', { e });
    throw e;
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));

  // Process each S3 record
  for (const record of event.Records || []) {
    try {
      // Extract S3 event details
      const s3Event = record.s3 || {};
      const bucket = s3Event.bucket?.name;
      // Decode the S3 object key - replace + with spaces before decoding (URL form encoding)
      const objectKey = decodeURIComponent((s3Event.object?.key || '').replace(/\+/g, ' '));

      // Verify it's an HTML file in pending-conversion
      if (!objectKey.startsWith('pending-conversion/') || !objectKey.endsWith('.html')) {
        console.log(`Skipping ${objectKey}: not an HTML file in pending-conversion/`);
        continue;
      }

      console.log(`Processing HTML file: ${objectKey}`);

      // Extract opportunity title from path: pending-conversion/{opportunityTitle}/NOFO-File-HTML.html
      const pathParts = objectKey.split('/');
      if (pathParts.length < 3) {
        console.log(`Invalid path structure: ${objectKey}`);
        continue;
      }

      const opportunityTitle = pathParts.slice(1, -1).join('/').replace(/\//g, '-');

      // Download HTML from S3
      const htmlResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        })
      );

      // Convert stream to string
      const chunks = [];
      for await (const chunk of htmlResponse.Body) {
        chunks.push(chunk);
      }
      const htmlContent = Buffer.concat(chunks).toString('utf-8');

      console.log(`Downloaded HTML for ${opportunityTitle}, size: ${htmlContent.length} bytes`);

      const stub = detectRedirectStub(htmlContent);
      if (stub) {
        console.log(`${objectKey} is a redirect stub pointing at ${stub.redirectTarget}`);
        const flagged = await flagForReview(
          opportunityTitle,
          `Source HTML is a redirect stub, not the notice itself (meta refresh to ${stub.redirectTarget}). ` +
            `Needs re-scraping from the target URL.`
        );
        if (flagged) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
          console.log(`Deleted unconvertible stub: ${objectKey}`);
        } else {
          console.error(`Keeping ${objectKey}: it could not be flagged, so deleting it would lose the failure.`);
        }
        continue;
      }

      // Convert HTML to PDF using Puppeteer/Chromium
      let pdfBuffer;
      try {
        pdfBuffer = await generatePdfBuffer(htmlContent);
        console.log(`Successfully converted HTML to PDF, size: ${pdfBuffer.length} bytes`);
      } catch (pdfError) {
        console.error(`Error converting HTML to PDF: ${pdfError.message}`, pdfError);
        await flagForReview(
          opportunityTitle,
          `HTML to PDF conversion failed: ${pdfError.message}`
        );
        continue;
      }

      // Upload PDF to final location
      const finalPdfKey = `${opportunityTitle}/NOFO-File-PDF`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: finalPdfKey,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        })
      );

      console.log(`Successfully uploaded PDF: ${finalPdfKey}`);

      // Delete the temporary HTML file
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        })
      );

      console.log(`Deleted temporary HTML file: ${objectKey}`);
    } catch (error) {
      console.error(`Error processing record: ${error.message}`, error);
      console.error(`Record: ${JSON.stringify(record)}`);
      // Don't raise - continue processing other records
      continue;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'HTML to PDF conversion completed' }),
  };
};

