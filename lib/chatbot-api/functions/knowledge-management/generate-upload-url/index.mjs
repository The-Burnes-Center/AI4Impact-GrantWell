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

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const body = JSON.parse(event.body);
    const { fileName, fileType } = body;

    if (!fileName || !fileType) {
      return badRequest('fileName and fileType are required');
    }

    if (!fileName.startsWith(`${userId}/`)) {
      return forbidden('Unauthorized: Can only upload to your own folder');
    }

    const command = new PutObjectCommand({
      Bucket: getBucketName(),
      Key: fileName,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: URL_EXPIRATION_SECONDS,
    });

    console.log('Generated upload URL', { bucket: getBucketName(), key: fileName, userId });

    return success({ signedUrl });
  } catch (e) {
    console.error('Error generating upload URL:', e.message);
    return serverError('Unable to generate upload URL');
  }
};
