/**
 * This Lambda function generates a presigned URL for uploading objects to an S3 bucket.
 * Restricted to Admin/Developer roles, with strict validation of the requested object key.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAdmin } from 'grantwell-shared';

const URL_EXPIRATION_SECONDS = 300; // URL valid for 5 minutes

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Restrict uploads to the well-known NOFO key pattern (<folder>/NOFO-File-<EXT>)
// and reject path-traversal or absolute paths. Folder names are limited to a
// safe character set to prevent injection into S3 keys or downstream pipelines.
const ALLOWED_KEY_PATTERN = /^[A-Za-z0-9 _.\-()]{1,200}\/NOFO-File-(PDF|TXT|DOCX)$/;

function isSafeKey(fileName) {
  if (typeof fileName !== 'string' || fileName.length === 0) return false;
  if (fileName.includes('..') || fileName.startsWith('/')) return false;
  return ALLOWED_KEY_PATTERN.test(fileName);
}

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Main Lambda entry point
export const handler = async (event) => {
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;
  try {
    return await getUploadURL(event);
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return jsonResponse(500, { message: 'An error occurred while generating the upload URL' });
  }
};

// Helper function to generate a presigned upload URL for S3
const getUploadURL = async function (event) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON in request body' });
  }
  const fileName = body.fileName;
  const fileType = body.fileType;

  if (!isSafeKey(fileName)) {
    return jsonResponse(400, {
      message: "Invalid fileName: must match '<folder>/NOFO-File-(PDF|TXT|DOCX)' with safe characters",
    });
  }
  if (!ALLOWED_CONTENT_TYPES.has(fileType)) {
    return jsonResponse(400, { message: 'Unsupported fileType' });
  }

  const s3Params = {
    Bucket: process.env.BUCKET, // S3 bucket name from environment variables
    Key: fileName, // S3 object key (filename)
    ContentType: fileType, // MIME type of the file
  };

  const s3 = new S3Client({
    region: 'us-east-1',
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const command = new PutObjectCommand(s3Params); // Create PutObjectCommand with given params

  try {
    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: URL_EXPIRATION_SECONDS, // Set URL expiration time
    });
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ signedUrl }),
    };
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to generate signed URL' }),
    };
  }
};