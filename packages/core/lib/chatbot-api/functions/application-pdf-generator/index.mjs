/**
 * Application PDF Generator Lambda Function
 *
 * This Lambda function generates tagged PDFs from application data using Puppeteer.
 * It creates a well-structured HTML document and converts it to a tagged PDF for accessibility.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { randomUUID } from 'crypto';
import {
  markdownToContentHtml,
  sanitizeContentHtml,
  recordEvent,
  touchLastActive,
} from 'grantwell-shared';

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-amz-security-token']);

function redactEvent(event) {
  const e = { ...event };
  if (e.headers) {
    e.headers = Object.fromEntries(
      Object.entries(e.headers).map(([k, v]) =>
        SENSITIVE_HEADERS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
      )
    );
  }
  if (typeof e.body === 'string') e.body = `[${e.body.length} chars omitted]`;
  else if (e.body) e.body = '[omitted]';
  const claims = e.requestContext?.authorizer?.jwt?.claims;
  if (claims) {
    e.requestContext = {
      ...e.requestContext,
      authorizer: { jwt: { claims: { ...claims, email: '[REDACTED]' } } },
    };
  }
  return e;
}


/**
 * Generate HTML content from draft data for PDF conversion.
 * 
 * @param {Object} draftData - Object containing draft information including:
 *   - title: Application title
 *   - grantName: Name of the grant/NOFO (optional, will be extracted from title if not provided)
 *   - projectBasics: Object of project basic information
 *   - sections: Object of section names and content
 * @returns {string} HTML string ready for PDF conversion
 */
function generateHtmlFromDraft(draftData) {
  let title = draftData.title || 'Grant Application';
  const projectBasics = draftData.projectBasics || {};
  const sections = draftData.sections || {};
  
  // Clean title: remove slashes that might come from path-like structures
  title = title.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  
  // Extract grant name from draftData.grantName, or try to extract from title
  // Title format is often "Application for [Grant Name]" or just use grantName if provided
  let grantName = draftData.grantName;
  if (!grantName && title) {
    // Try to extract grant name from title if it follows "Application for [Grant Name]" pattern
    const match = title.match(/Application for (.+)/i);
    if (match) {
      grantName = match[1].trim();
    } else {
      // If title doesn't match pattern, use the title itself as grant name
      grantName = title;
    }
  }
  // Fallback to generic grant application if no grant name found
  grantName = grantName || 'Grant Application';
  
  // Clean grant name: remove slashes and other path-like characters
  // Replace forward slashes with spaces for better readability in PDF
  grantName = grantName.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  
  // Map database field names to human-readable labels
  const fieldLabelMap = {
    'projectName': 'Project Name',
    'organizationName': 'Organization Name',
    'requestedAmount': 'Requested Amount',
    'location': 'Location',
    'zipCode': 'Zip Code',
    'contactName': 'Primary Contact Name',
    'contactEmail': 'Contact Email',
    // Handle snake_case variants
    'project_name': 'Project Name',
    'organization_name': 'Organization Name',
    'requested_amount': 'Requested Amount',
    'zip_code': 'Zip Code',
    'contact_name': 'Primary Contact Name',
    'contact_email': 'Contact Email',
  };
  
  // Helper function to convert field name to human-readable label
  const getFieldLabel = (fieldName) => {
    return fieldLabelMap[fieldName] || fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  };
  
  // Build project basics HTML
  let projectBasicsHtml = '';
  if (Object.keys(projectBasics).length > 0) {
    projectBasicsHtml = '<div class="project-basics">';
    for (const [key, value] of Object.entries(projectBasics)) {
      if (value) {
        const label = getFieldLabel(key);
        projectBasicsHtml += `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
      }
    }
    projectBasicsHtml += '</div>';
  }
  
  // Build table of contents
  let tocHtml = '';
  if (Object.keys(sections).length > 0) {
    tocHtml = '<div class="toc"><h2>Table of Contents</h2><ol>';
    let idx = 1;
    for (const sectionName of Object.keys(sections)) {
      tocHtml += `<li>${idx}. ${escapeHtml(sectionName)}</li>`;
      idx++;
    }
    tocHtml += '</ol></div>';
  }
  
  // Build sections HTML
  let sectionsHtml = '';
  let idx = 1;
  for (const [sectionName, content] of Object.entries(sections)) {
    sectionsHtml += `
        <section id="section-${idx}" class="section">
            <h2>${idx}. ${escapeHtml(sectionName)}</h2>
            <div class="content">${sanitizeContentHtml(markdownToContentHtml(content))}</div>
        </section>
        `;
    idx++;
  }
  
  // Complete HTML document with semantic structure for accessibility
  // Using semantic HTML5 elements (header, main, footer, section) and proper heading hierarchy
  // helps screen readers and assistive technologies navigate the document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        @page {
            size: A4;
            margin: 40pt 50pt;
        }
        body {
            font-family: 'Times New Roman', serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            max-width: 100%;
            margin: 0;
            padding: 0;
        }
        h1 {
            font-size: 18pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 14pt;
            page-break-after: avoid;
        }
        h2 {
            font-size: 13pt;
            font-weight: bold;
            margin-top: 20pt;
            margin-bottom: 9pt;
            page-break-after: avoid;
        }
        h3 {
            font-size: 12pt;
            font-weight: bold;
            margin: 14pt 0 6pt;
            page-break-after: avoid;
        }
        h4, h5, h6 {
            font-size: 12pt;
            font-weight: bold;
            font-style: italic;
            margin: 12pt 0 4pt;
            page-break-after: avoid;
        }
        p {
            margin: 0 0 9pt;
        }
        ul, ol {
            margin: 0 0 9pt;
            padding-left: 24pt;
        }
        li {
            margin-bottom: 4pt;
        }
        blockquote {
            margin: 9pt 0 9pt 18pt;
            padding-left: 12pt;
            border-left: 2pt solid #666;
            font-style: italic;
        }
        pre {
            margin: 0 0 9pt;
            white-space: pre-wrap;
        }
        code, pre {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
        }
        .content table {
            width: 100%;
            border-collapse: collapse;
            margin: 9pt 0;
            font-size: 11pt;
        }
        .content th, .content td {
            border: 0.75pt solid #000;
            padding: 4pt 6pt;
            text-align: left;
            vertical-align: top;
        }
        .content th {
            font-weight: bold;
        }
        .content tr {
            page-break-inside: avoid;
        }
        .project-basics {
            text-align: center;
            margin-bottom: 20pt;
        }
        .project-basics p {
            margin: 8pt 0;
        }
        .toc {
            margin: 30pt 0;
            page-break-after: always;
        }
        .toc ol {
            list-style: none;
            padding-left: 0;
        }
        .toc li {
            margin: 8pt 0;
            padding-left: 30pt;
            text-indent: -30pt;
        }
        .toc li::before {
            content: leader('.') ' ';
        }
        /* No page-break-inside: avoid — Chromium pushes any section longer than a page to a fresh one. */
        .section {
            margin-bottom: 20pt;
            orphans: 2;
            widows: 2;
        }
        .content {
            margin-top: 9pt;
            text-align: justify;
        }
        @media print {
            .toc {
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    <header role="banner">
        <h1>${escapeHtml(grantName)}</h1>
        <h2 style="font-size: 14pt; font-weight: normal; text-align: center;">${escapeHtml(title)}</h2>
    </header>
    
    ${projectBasicsHtml}
    
    <nav aria-label="Table of Contents">
        ${tocHtml}
    </nav>
    
    <main role="main">
        ${sectionsHtml}
    </main>
</body>
</html>`;
  
  return html;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate PDF buffer from HTML content using Puppeteer/Chromium
 */
async function generatePdfBuffer(html) {
  let browser = null;
  try {
    console.log('Launching browser for PDF generation');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
      executablePath: await chromium.executablePath(),
      headless: 'shell',
      ignoreHTTPSErrors: true,
    });

    console.log('Browser launched');
    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0', 'load'],
    });
    
    // Scroll to ensure all content is rendered
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    
    // Generate PDF with accessibility features
    // The HTML uses semantic structure (header, main, footer, sections, headings, ARIA roles)
    // which Chromium preserves in the PDF structure for better accessibility
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.556in',
        right: '0.694in',
        bottom: '0.556in',
        left: '0.694in'
      }
    });

    return Buffer.from(pdfBytes);
  } catch (e) {
    console.error('PDF generation error', { e });
    throw e;
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
}

/**
 * Lambda handler for PDF generation.
 * 
 * Expected event structure:
 * {
 *   "body": {
 *     "draftData": {
 *       "title": "...",
 *       "grantName": "Grant Name" (optional, will be extracted from title if not provided),
 *       "projectBasics": {...},
 *       "sections": {...}
 *     }
 *   }
 * }
 */
/** Async export: Chromium runs do not fit API Gateway's 30s integration timeout. */
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

const EXPORTS_BUCKET = process.env.EXPORTS_BUCKET;
const EXPORT_JOBS_TABLE_NAME = process.env.EXPORT_JOBS_TABLE_NAME;
/** Matches the exports bucket lifecycle, so a row never outlives its object. */
const JOB_TTL_SECONDS = 24 * 60 * 60;

function exportObjectKey(userId, jobId) {
  return `exports/${userId}/${jobId}.pdf`;
}

async function putExportJob(fields) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: EXPORT_JOBS_TABLE_NAME,
      Item: marshall(
        {
          jobType: 'export',
          exportFormat: 'pdf',
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS,
          ...fields,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

/** Every attribute is aliased: `status` and `error` are both DynamoDB reserved words. */
async function updateExportJob(jobId, status, extra = {}) {
  const fields = { status, ...extra };
  const names = {};
  const values = {};
  const sets = Object.keys(fields).map((field, i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = fields[field];
    return `#f${i} = :v${i}`;
  });
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: EXPORT_JOBS_TABLE_NAME,
      Key: marshall({ jobId }),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
    })
  );
}

async function startExportJob(event, draftData) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  if (!claims.sub) {
    return {
      statusCode: 401,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }
  if (!EXPORTS_BUCKET || !EXPORT_JOBS_TABLE_NAME) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Async export is not configured' }),
    };
  }

  const jobId = randomUUID();
  // userId is the ownership key the status handler checks; never take it from the body.
  await putExportJob({
    jobId,
    userId: claims.sub,
    status: 'in_progress',
    objectKey: exportObjectKey(claims.sub, jobId),
  });

  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          exportWorker: { jobId, userId: claims.sub, claims, draftData },
        })
      ),
    })
  );

  console.log(`Export job ${jobId} started for user ${claims.sub}`);
  return {
    statusCode: 202,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobId, status: 'in_progress' }),
  };
}

async function runExportWorker({ jobId, userId, claims, draftData }) {
  try {
    const pdfBuffer = await generatePdfBuffer(generateHtmlFromDraft(draftData));
    const objectKey = exportObjectKey(userId, jobId);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: EXPORTS_BUCKET,
        Key: objectKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ContentDisposition: 'attachment; filename="grant-application.pdf"',
      })
    );
    await updateExportJob(jobId, 'completed', {
      completedAt: new Date().toISOString(),
      sizeBytes: pdfBuffer.length,
    });
    console.log(`Export job ${jobId} completed, ${pdfBuffer.length} bytes at ${objectKey}`);
    await recordExportAnalytics(claims, draftData);
  } catch (error) {
    console.error(`Export job ${jobId} failed:`, error);
    await updateExportJob(jobId, 'error', {
      error: error.message || 'PDF generation failed',
      completedAt: new Date().toISOString(),
    }).catch((e) => console.error(`Could not mark job ${jobId} failed:`, e));
    throw error;
  }
}

async function recordExportAnalytics(claims, draftData) {
  if (!claims?.sub) return;
  try {
    const state = String(claims['custom:state'] || '').trim().toUpperCase();
    await recordEvent({
      eventType: 'draft_downloaded',
      userId: claims.sub,
      state,
      nofoName: draftData.documentIdentifier || draftData.document_identifier || '',
    });
    await touchLastActive(claims.sub, state);
  } catch (error) {
    console.warn('Export analytics failed:', error.message);
  }
}

export const handler = async (event) => {
  if (event?.exportWorker) {
    await runExportWorker(event.exportWorker);
    return { statusCode: 200 };
  }

  try {
    console.log('Event received:', JSON.stringify(redactEvent(event)));

    // Parse request body
    let body;
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body || {};
    }
    
    const draftData = body.draftData || {};
    
    if (!draftData || Object.keys(draftData).length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'draftData is required'
        })
      };
    }
    
    // Validate required fields
    if (!draftData.sections || Object.keys(draftData.sections).length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'draftData.sections is required'
        })
      };
    }

    if (body.async === true) {
      return await startExportJob(event, draftData);
    }

    // Generate HTML from draft data
    console.log('Generating HTML from draft data');
    const htmlContent = generateHtmlFromDraft(draftData);
    
    // Generate PDF
    console.log('Generating PDF from HTML');
    const pdfBuffer = await generatePdfBuffer(htmlContent);
    
    // Return PDF as base64 encoded string
    const pdfBase64 = pdfBuffer.toString('base64');
    
    console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes, base64 length: ${pdfBase64.length}`);

    // Successful export = a download. Best-effort tracking; never blocks the response.
    const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
    if (claims.sub) {
      const state = String(claims["custom:state"] || "").trim().toUpperCase();
      await recordEvent({
        eventType: "draft_downloaded",
        userId: claims.sub,
        state,
        nofoName: draftData.documentIdentifier || draftData.document_identifier || "",
      });
      await touchLastActive(claims.sub, state);
    }


    // API Gateway HTTP API v2 response format
    // Note: isBase64Encoded must be true for binary content
    // API Gateway will automatically decode the base64 body before sending to client
    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="grant-application.pdf"'
      },
      body: pdfBase64,
      isBase64Encoded: true
    };
    
    console.log('Returning response with statusCode:', response.statusCode, 'body length:', response.body.length);
    return response;
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    console.error('Stack trace:', error.stack);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate PDF',
        message: error.message
      })
    };
  }
};

