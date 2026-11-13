/**
 * Presigned GET URLs: the caller's own supporting documents (POST), and a grant's published PDF
 * (GET /grant-pdf-url, see grant-pdf.mjs).
 *
 * Env: USER_DOCUMENTS_BUCKET
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, forbidden, badRequest, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';
import { isOwnKey } from '../shared/keys.mjs';
import { grantPdfUrl } from './grant-pdf.mjs';

const URL_EXPIRATION_SECONDS = 300;

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();
    if (event.requestContext?.http?.method === 'GET') return await grantPdfUrl(event);

    const body = JSON.parse(event.body);
    const { fileName } = body;

    if (!fileName) {
      return badRequest('fileName is required');
    }

    if (!isOwnKey(fileName, userId)) {
      return forbidden('Unauthorized: Can only download your own files');
    }

    const name = fileName.split('/').pop();
    const asciiName = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const command = new GetObjectCommand({
      Bucket: getBucketName(),
      Key: fileName,
      // Without it a browser opens text and PDFs in the tab instead of saving them.
      ResponseContentDisposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });

    const signedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: URL_EXPIRATION_SECONDS,
    });

    console.log('Generated download URL', { bucket: getBucketName(), key: fileName, userId });

    return success({ signedUrl });
  } catch (e) {
    console.error('Error generating download URL:', e.message);
    return serverError('Unable to generate download URL');
  }
};
