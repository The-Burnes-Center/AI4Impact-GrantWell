/**
 * Application DOCX Generator Lambda Function
 *
 * Generates a Word (.docx) document from grant application draft data.
 * Accepts the same request shape as application-pdf-generator.
 * Section bodies are stored as Markdown and converted to HTML before html-to-docx.
 */

import { createRequire } from 'module';
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
const require = createRequire(import.meta.url);
const HTMLtoDOCX = require('html-to-docx');
const JSZip = require('jszip');

// html-to-docx@1.8.0 emits two things the spec disallows; Word repairs them silently, stricter readers do not.

const OK = 'already-valid';
const UNRECOGNISED = 'unrecognised';

/** `w:sectPr` is only valid as the LAST child of `w:body`; the library puts it first. */
function moveSectPrToEndOfBody(documentXml) {
  const leading = documentXml.match(/<w:body>\s*(<w:sectPr(?:\s[^>]*)?>[\s\S]*?<\/w:sectPr>)/);
  if (leading) {
    return documentXml
      .replace(leading[0], '<w:body>')
      .replace('</w:body>', `${leading[1]}</w:body>`);
  }
  return /<\/w:sectPr>\s*<\/w:body>/.test(documentXml) ? OK : UNRECOGNISED;
}

/** Every Heading style says basedOn="Normal", but the library never defines Normal. */
function defineNormalStyle(stylesXml) {
  if (/<w:style\b[^>]*w:styleId="Normal"/.test(stylesXml)) return OK;
  if (!stylesXml.includes('</w:docDefaults>')) return UNRECOGNISED;
  const normal =
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/></w:style>';
  return stylesXml.replace('</w:docDefaults>', `</w:docDefaults>${normal}`);
}

async function repairOoxml(docxBuffer) {
  const zip = await JSZip.loadAsync(docxBuffer);
  const targets = [
    { path: 'word/document.xml', patch: moveSectPrToEndOfBody, what: 'w:sectPr moved to the end of w:body' },
    { path: 'word/styles.xml', patch: defineNormalStyle, what: 'Normal style defined' },
  ];

  let patched = 0;
  for (const target of targets) {
    const entry = zip.file(target.path);
    if (!entry) {
      console.error(`OOXML repair: ${target.path} is missing from the generated package.`);
      continue;
    }

    const result = target.patch(await entry.async('string'));
    if (result === OK) {
      console.log(`OOXML repair: ${target.what} already — nothing to do.`);
    } else if (result === UNRECOGNISED) {
      console.error(
        `OOXML repair: ${target.path} does not match the expected html-to-docx shape, so "${target.what}" ` +
          'was NOT applied. Re-check application-docx-generator after any html-to-docx upgrade.'
      );
    } else {
      zip.file(target.path, result);
      patched += 1;
      console.log(`OOXML repair: ${target.what}.`);
    }
  }

  if (patched === 0) return docxBuffer;
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text) {
  if (typeof text !== 'string') text = String(text);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/** sanitizeContentHtml strips every attribute, so the borders have to be re-applied after it. */
function withTableBorders(html) {
  return html
    .replace(/<table>/g, '<table border="1" style="border-collapse:collapse;width:100%;">')
    .replace(
      /<th>([\s\S]*?)<\/th>/g,
      '<th style="border:1px solid #000000;padding:4pt;text-align:left;"><strong>$1</strong></th>'
    )
    .replace(/<td>/g, '<td style="border:1px solid #000000;padding:4pt;">');
}

function renderSectionBody(content) {
  return withTableBorders(sanitizeContentHtml(markdownToContentHtml(content)));
}

/**
 * Build an HTML document from draftData — same structure as the PDF generator
 * so the DOCX output matches the PDF layout.
 *
 * No doctype and no whitespace between block elements: html-to-docx turns both into empty paragraphs.
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
    tocHtml = '<h2>Table of Contents</h2><ol>';
    for (const name of sectionKeys) {
      tocHtml += `<li>${escapeHtml(name)}</li>`;
    }
    tocHtml += '</ol>';
  }

  // Sections
  let sectionsHtml = '';
  sectionKeys.forEach((name, i) => {
    sectionsHtml += `<h2>${i + 1}. ${escapeHtml(name)}</h2>${renderSectionBody(sections[name])}`;
  });

  return (
    '<html lang="en"><head><meta charset="UTF-8">' +
    `<title>${escapeHtml(title)}</title></head><body>` +
    `<h1 style="text-align:center;">${escapeHtml(grantName)}</h1>` +
    `<h2 style="text-align:center;font-weight:normal;">${escapeHtml(title)}</h2>` +
    projectBasicsHtml +
    tocHtml +
    sectionsHtml +
    '</body></html>'
  );
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
 *     "sections": { "Section Name": "Markdown, as the generator emitted it" }
 *   }
 * }
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(redactEvent(event)));

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
    const rawDocx = await HTMLtoDOCX(html, null, {
      font: 'Times New Roman',
      fontSize: 24,      // 12pt (half-points)
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: true,
    });

    const docxBuffer = await repairOoxml(Buffer.from(rawDocx));
    const docxBase64 = docxBuffer.toString('base64');
    console.log(`DOCX generated, size: ${docxBuffer.length} bytes`);

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
