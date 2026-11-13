/**
 * Loads the documents an applicant selected from their library straight from the user-documents
 * bucket, so the model reads them in full instead of through knowledge-base search.
 *
 * Self-contained (only @aws-sdk/client-s3 and node:zlib). The copies in websocket-chat/,
 * draft-pipeline/generate-section/ and knowledge-management/document-safeguards/ must stay
 * byte-identical (test/lambda/supporting-documents.test.ts checks).
 *
 *   const docs = await loadSupportingDocuments({ s3, bucket, userId, documentKeys, documentIdentifier, gate });
 *   docs.selected  [key]                              what the selection resolved to
 *   docs.pdfs      [{ key, fileName, bytes, pages }]  attach with pdfContentBlocks(docs)
 *   docs.texts     [{ key, fileName, content }]       full text (DOCX, txt, csv, md, html, ...)
 *   docs.skipped   [{ key, fileName, reason }]        not given to the model; tell the user (SKIP_REASONS)
 *
 * userId is the library owner (the first key segment, the Cognito username). documentKeys is the
 * chat's or application's stored selection; null or undefined means none was ever stored, which
 * selects everything in that grant's pre-library folder ("<userId>/<grant>/" and "<grant>//").
 * Selected keys no longer in the library (deleted files) are ignored.
 *
 * gate, when given, decides which readable files may be used at all (document-relevance.mjs):
 * async (objects) => Map<key, { usable, reason?: 'not-related' | 'not-checked' }>. A file missing
 * from the map is not used.
 */

import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { inflateRawSync } from 'node:zlib';

// One request carries these next to the grant's text (up to ~300k tokens) inside Claude's 1M-token
// context and Bedrock's 32 MB request: base64 makes 20 MB of PDF about 27 MB, and a PDF page costs
// roughly 1.5k-3k tokens. packages/ui/src/common/helpers/document-budget.ts mirrors the byte caps.
export const DEFAULT_LIMITS = Object.freeze({
  maxPdfBytes: 20 * 1024 * 1024,
  maxPdfPages: 150,
  maxTextChars: 200_000,
  maxDownloadBytes: 25 * 1024 * 1024,
  maxInflatedBytes: 50 * 1024 * 1024,
  maxFiles: 25,
});

/** What a user is told about a file the AI skipped. */
export const SKIP_REASONS = Object.freeze({
  unsupported: "The AI can't read this file type",
  'too-large': 'Too large for the AI to read',
  'over-budget': 'Skipped: the other selected files used up what the AI can read at once',
  unreadable: "The AI couldn't open this file",
  'not-related': "Not used: doesn't look related to this grant",
  'not-checked': "Couldn't check this document yet, try again",
});

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'md', 'html', 'json', 'xml', 'rtf']);

export const normalizeEtag = (etag) => String(etag ?? '').replace(/"/g, '');

export function grantFolderName(documentIdentifier) {
  return String(documentIdentifier ?? '').replace(/\/+$/, '').split('/').pop() || '';
}

/** The folder a grant's documents were uploaded to before the library; also holds its "//" keys. */
export function legacyGrantPrefix(userId, documentIdentifier) {
  const grant = grantFolderName(documentIdentifier);
  return userId && grant ? `${userId}/${grant}/` : null;
}

/** The library objects a selection names, or for no stored selection the grant's old folder. */
export function selectDocuments(library, { userId, documentKeys, documentIdentifier }) {
  if (Array.isArray(documentKeys)) {
    const wanted = new Set(documentKeys.filter((k) => typeof k === 'string' && k.startsWith(`${userId}/`)));
    return library.filter((o) => wanted.has(o.key));
  }
  const prefix = legacyGrantPrefix(userId, documentIdentifier);
  return prefix ? library.filter((o) => o.key.startsWith(prefix)) : [];
}

export function kindOf(fileName) {
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  return TEXT_EXTENSIONS.has(ext) ? 'text' : null;
}

/** Every document in the user's library, newest first, so the budget keeps recent uploads. */
export async function listLibrary(s3, bucket, userId) {
  const prefix = `${userId}/`;
  const objects = [];
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    for (const o of page.Contents || []) {
      if (o.Key.endsWith('.metadata.json') || o.Key.endsWith('/') || !o.Size) continue;
      objects.push({ key: o.Key, fileName: o.Key.split('/').pop(), size: o.Size, etag: normalizeEtag(o.ETag), lastModified: new Date(o.LastModified ?? 0).getTime() });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects.sort((a, b) => b.lastModified - a.lastModified || a.key.localeCompare(b.key));
}

export async function readObject(s3, bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

/** Rough page count; object streams can hide page objects, so the model call is the backstop. */
export function estimatePdfPages(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
}

function zipEntry(buffer, name, maxInflatedBytes) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buffer.length; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    if (buffer.toString('utf8', p + 46, p + 46 + nameLength) === name) {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: maxInflatedBytes });
      return null;
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Paragraph text of a .docx (word/document.xml), or null when it isn't one. Throws
 * ERR_BUFFER_TOO_LARGE when the body inflates past maxInflatedBytes.
 */
export function extractDocxText(buffer, maxInflatedBytes = DEFAULT_LIMITS.maxInflatedBytes) {
  const xml = zipEntry(buffer, 'word/document.xml', maxInflatedBytes);
  if (!xml) return null;
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(?:br|cr)\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e])
    .replace(/&#(x?)([0-9a-fA-F]+);/g, (_, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Within the per-file caps; the shared budgets apply later, to the files actually used. */
function fitsAlone({ fileName, size }, caps) {
  const kind = kindOf(fileName);
  return Boolean(kind) && size <= (kind === 'pdf' ? caps.maxPdfBytes : caps.maxDownloadBytes);
}

export async function loadSupportingDocuments({ s3, bucket, userId, documentKeys, documentIdentifier, limits = {}, gate }) {
  const caps = { ...DEFAULT_LIMITS, ...limits };
  const result = { selected: [], pdfs: [], texts: [], skipped: [] };
  if (!s3 || !bucket || !userId) return result;
  if (Array.isArray(documentKeys) && documentKeys.length === 0) return result;

  let pdfBytes = 0;
  let pdfPages = 0;
  let textChars = 0;
  const objects = selectDocuments(await listLibrary(s3, bucket, userId), { userId, documentKeys, documentIdentifier });
  result.selected = objects.map((o) => o.key);
  const allowed = gate ? await gate(objects.filter((o, index) => index < caps.maxFiles && fitsAlone(o, caps))) : null;

  for (const [index, object] of objects.entries()) {
    const { key, fileName, size } = object;
    const skip = (reason) => result.skipped.push({ key, fileName, reason });
    const kind = kindOf(fileName);
    if (!kind) { skip('unsupported'); continue; }
    if (index >= caps.maxFiles) { skip('over-budget'); continue; }

    if (!fitsAlone(object, caps)) { skip('too-large'); continue; }
    if (allowed && !allowed.get(key)?.usable) {
      skip(allowed.get(key)?.reason === 'not-related' ? 'not-related' : 'not-checked');
      continue;
    }
    if (kind === 'pdf' && pdfBytes + size > caps.maxPdfBytes) { skip('over-budget'); continue; }

    let bytes;
    try {
      bytes = await readObject(s3, bucket, key);
    } catch (error) {
      console.warn(`Supporting document ${key} could not be read: ${error?.name}`);
      skip('unreadable');
      continue;
    }

    if (kind === 'pdf') {
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') { skip('unreadable'); continue; }
      const pages = estimatePdfPages(bytes);
      if (pdfPages + pages > caps.maxPdfPages) { skip(pages > caps.maxPdfPages ? 'too-large' : 'over-budget'); continue; }
      pdfBytes += bytes.length;
      pdfPages += pages;
      result.pdfs.push({ key, fileName, bytes, pages });
      continue;
    }

    let content;
    try {
      content = kind === 'docx' ? extractDocxText(bytes, caps.maxInflatedBytes) : new TextDecoder('utf-8').decode(bytes).trim();
    } catch (error) {
      if (error?.code === 'ERR_BUFFER_TOO_LARGE') { skip('too-large'); continue; }
      content = null;
    }
    if (content === null) { skip('unreadable'); continue; }
    if (!content) continue;
    if (content.length > caps.maxTextChars) { skip('too-large'); continue; }
    if (textChars + content.length > caps.maxTextChars) { skip('over-budget'); continue; }
    textChars += content.length;
    result.texts.push({ key, fileName, content });
  }
  return result;
}

/** Anthropic Messages content blocks (Bedrock InvokeModel body) for the loaded PDFs, each labelled by name. */
export function pdfContentBlocks(documents) {
  return documents.pdfs.flatMap(({ fileName, bytes }) => [
    { type: 'text', text: `Applicant supporting document "${fileName.replace(/["<>]/g, '')}" (PDF):` },
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } },
  ]);
}
