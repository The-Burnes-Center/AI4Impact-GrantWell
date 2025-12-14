/**
 * Application PDF Generator Lambda Function
 * 
 * This Lambda function generates tagged PDFs from application data using Puppeteer.
 * It creates a well-structured HTML document and converts it to a tagged PDF for accessibility.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
  const title = draftData.title || 'Grant Application';
  const projectBasics = draftData.projectBasics || {};
  const sections = draftData.sections || {};
  
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
  
  // Build project basics HTML
  let projectBasicsHtml = '';
  if (Object.keys(projectBasics).length > 0) {
    projectBasicsHtml = '<div class="project-basics">';
    for (const [key, value] of Object.entries(projectBasics)) {
      if (value) {
        projectBasicsHtml += `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</p>`;
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
      tocHtml += `<li><a href="#section-${idx}">${escapeHtml(sectionName)}</a></li>`;
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
            <div class="content">${content}</div>
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
        .section {
            margin-bottom: 20pt;
            page-break-inside: avoid;
        }
        .content {
            margin-top: 9pt;
            text-align: justify;
        }
        .footer {
            position: fixed;
            bottom: 20pt;
            width: 100%;
            text-align: center;
            font-size: 10pt;
            color: #666;
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
    
    <footer class="footer" role="contentinfo">
        Generated by AI. Please review and edit as needed before submission.
    </footer>
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
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.556in',
        right: '0.694in',
        bottom: '0.556in',
        left: '0.694in'
      }
    });
    
    return pdfBuffer;
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
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    
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
    
    // Generate HTML from draft data
    console.log('Generating HTML from draft data');
    const htmlContent = generateHtmlFromDraft(draftData);
    
    // Generate PDF
    console.log('Generating PDF from HTML');
    const pdfBuffer = await generatePdfBuffer(htmlContent);
    
    // Return PDF as base64 encoded string
    const pdfBase64 = pdfBuffer.toString('base64');
    
    console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes, base64 length: ${pdfBase64.length}`);
    
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

