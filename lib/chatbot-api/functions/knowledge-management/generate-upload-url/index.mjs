/**
 * Generates a presigned PUT URL for uploading a document to S3.
 *
 * Env: USER_DOCUMENTS_BUCKET
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, forbidden, badRequest, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';

const URL_EXPIRATION_SECONDS = 300;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// Mirrors the client allowlist in UploadDocuments.tsx. Keep in sync.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/markdown',
  'application/rtf',
  'application/epub+zip',
  'application/vnd.oasis.opendocument.text',
  'text/tab-separated-values',
  'message/rfc822',
  'application/vnd.ms-outlook',
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'html', 'json', 'xml', 'md', 'rtf',
  'epub', 'odt', 'tsv', 'eml', 'msg',
]);

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const body = JSON.parse(event.body);
    const { fileName, fileType, fileSize } = body;

    if (!fileName || !fileType) {
      return badRequest('fileName and fileType are required');
    }

    if (!fileName.startsWith(`${userId}/`)) {
      return forbidden('Unauthorized: Can only upload to your own folder');
    }

    if (!ALLOWED_MIME_TYPES.has(fileType)) {
      return badRequest(`Unsupported file type: ${fileType}`);
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return badRequest(`Unsupported file extension: .${ext}`);
    }

    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
      return badRequest('fileSize is required and must be a positive number');
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return badRequest(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`);
    }

    // ContentLength makes S3 enforce exact byte match — a client that lied
    // about fileSize cannot upload more than declared.
    const command = new PutObjectCommand({
      Bucket: getBucketName(),
      Key: fileName,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const signedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: URL_EXPIRATION_SECONDS,
      unhoistableHeaders: new Set(['content-length']),
    });

    console.log('Generated upload URL', { bucket: getBucketName(), key: fileName, userId, fileSize });

    return success({ signedUrl });
  } catch (e) {
    console.error('Error generating upload URL:', e.message);
    return serverError('Unable to generate upload URL');
  }
};
