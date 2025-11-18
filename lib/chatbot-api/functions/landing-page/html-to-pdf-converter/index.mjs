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

const s3Client = new S3Client({ region: 'us-east-1' });
const BUCKET = process.env.BUCKET;

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

      const opportunityTitle = pathParts[1]; // Second part is the opportunity title

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

      // Convert HTML to PDF using Puppeteer/Chromium
      let pdfBuffer;
      try {
        pdfBuffer = await generatePdfBuffer(htmlContent);
        console.log(`Successfully converted HTML to PDF, size: ${pdfBuffer.length} bytes`);
      } catch (pdfError) {
        console.error(`Error converting HTML to PDF: ${pdfError.message}`, pdfError);
        throw pdfError;
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

