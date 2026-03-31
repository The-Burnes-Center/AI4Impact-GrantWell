/**
 * Application DOCX Generator Lambda Function
 *
 * Generates a Word (.docx) document from grant application draft data.
 * Accepts the same request shape as application-pdf-generator.
 * Uses html-to-docx to convert the formatted HTML representation of the draft
 * into a DOCX buffer, preserving basic formatting (bold, italic, lists, headings).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HTMLtoDOCX = require('html-to-docx');

/**
 * Escape HTML special characters.
 */
function escapeHtml(text) {
  if (typeof text !== 'string') text = String(text);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Build an HTML document from draftData — same structure as the PDF generator
 * so the DOCX output matches the PDF layout.
 */
function generateHtmlFromDraft(draftData) {
  let title = draftData.title || 'Grant Application';
  const projectBasics = draftData.projectBasics || {};
  const sections = draftData.sections || {};

  title = title.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

  let grantName = draftData.grantName;
  if (!grantName && title) {
    const match = title.match(/Application for (.+)/i);
    grantName = match ? match[1].trim() : title;
  }
  grantName = (grantName || 'Grant Application')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const fieldLabelMap = {
    projectName: 'Project Name',
    organizationName: 'Organization Name',
    requestedAmount: 'Requested Amount',
    location: 'Location',
    zipCode: 'Zip Code',
    contactName: 'Primary Contact Name',
    contactEmail: 'Contact Email',
    project_name: 'Project Name',
    organization_name: 'Organization Name',
    requested_amount: 'Requested Amount',
    zip_code: 'Zip Code',
    contact_name: 'Primary Contact Name',
    contact_email: 'Contact Email',
  };

  const getFieldLabel = (fieldName) =>
    fieldLabelMap[fieldName] ||
    fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();

  // Project basics block
  let projectBasicsHtml = '';
  const basicEntries = Object.entries(projectBasics).filter(([, v]) => v);
  if (basicEntries.length > 0) {
    projectBasicsHtml = '<div style="text-align:center;margin-bottom:20pt;">';
    for (const [key, value] of basicEntries) {
      projectBasicsHtml += `<p><strong>${escapeHtml(getFieldLabel(key))}:</strong> ${escapeHtml(value)}</p>`;
    }
    projectBasicsHtml += '</div>';
  }

  // Table of contents
  let tocHtml = '';
  const sectionKeys = Object.keys(sections);
  if (sectionKeys.length > 0) {
    tocHtml = '<div style="margin:30pt 0;"><h2>Table of Contents</h2><ol>';
    sectionKeys.forEach((name, i) => {
      tocHtml += `<li>${i + 1}. ${escapeHtml(name)}</li>`;
    });
    tocHtml += '</ol></div><hr/>';
  }

  // Sections
  let sectionsHtml = '';
  sectionKeys.forEach((name, i) => {
    sectionsHtml += `
      <div style="margin-bottom:20pt;">
        <h2>${i + 1}. ${escapeHtml(name)}</h2>
        <div>${sections[name]}</div>
      </div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <h1 style="text-align:center;">${escapeHtml(grantName)}</h1>
  <h2 style="text-align:center;font-weight:normal;">${escapeHtml(title)}</h2>
  ${projectBasicsHtml}
  ${tocHtml}
  ${sectionsHtml}
</body>
</html>`;
}

/**
 * Lambda handler.
 *
 * Expected request body:
 * {
 *   "draftData": {
 *     "title": "...",
 *     "grantName": "...",        (optional)
 *     "projectBasics": { ... },
 *     "sections": { "Section Name": "<html>..." }
 *   }
 * }
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));

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
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'draftData is required' }),
      };
    }

    if (!draftData.sections || Object.keys(draftData.sections).length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'draftData.sections is required' }),
      };
    }

    console.log('Generating HTML from draft data');
    const html = generateHtmlFromDraft(draftData);

    console.log('Converting HTML to DOCX');
    const docxBuffer = await HTMLtoDOCX(html, null, {
      font: 'Times New Roman',
      fontSize: '24',      // 12pt (half-points)
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: true,
    });

    const docxBase64 = Buffer.from(docxBuffer).toString('base64');
    console.log(`DOCX generated, size: ${docxBuffer.length} bytes`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="grant-application.docx"',
      },
      body: docxBase64,
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error generating DOCX:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate DOCX', message: error.message }),
    };
  }
};
