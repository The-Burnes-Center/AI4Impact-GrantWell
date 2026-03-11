/**
 * Generates a presigned GET URL for downloading a document from S3.
 *
 * Env: USER_DOCUMENTS_BUCKET
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, forbidden, badRequest, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';

const URL_EXPIRATION_SECONDS = 300;

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const body = JSON.parse(event.body);
    const { fileName } = body;

    if (!fileName) {
      return badRequest('fileName is required');
    }

    if (!fileName.startsWith(`${userId}/`)) {
      return forbidden('Unauthorized: Can only download your own files');
    }

    const command = new GetObjectCommand({
      Bucket: getBucketName(),
      Key: fileName,
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
