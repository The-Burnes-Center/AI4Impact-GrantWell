/**
 * GET /grant-pdf-url?grant=<name>: a short-lived link to a grant's published PDF, for a viewer who
 * may open that grant (the same checks as the summary). 404 when the grant can't be opened or has
 * no source document; `{available:false}` when its source is text (TXT, or a DOCX converted to it).
 *
 * Env: NOFO_BUCKET, NOFO_METADATA_TABLE_NAME, SUPPORTED_STATES, LEGACY_STATELESS_ADMIN_IS_PLATFORM, SINGLE_STATE
 */

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  canViewGrant,
  effectiveGrantScope,
  grantViewerScope,
  IN_REVIEW_STATUSES,
  isMissingObject,
  opensGrantInReview,
  PENDING_PREFIX,
  readGrantRow,
} from 'grantwell-shared';
import { success, badRequest, serverError } from '../shared/response.mjs';
import { getS3Client } from '../shared/s3.mjs';

const URL_EXPIRATION_SECONDS = 300;

const notFound = () => ({
  statusCode: 404,
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ message: 'No PDF for this grant' }),
});

const isGrantName = (name) =>
  typeof name === 'string' &&
  name.trim() !== '' &&
  !name.includes('/') &&
  name !== '.' &&
  name !== '..' &&
  !`${name}/`.startsWith(PENDING_PREFIX);

async function exists(bucket, key) {
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isMissingObject(error)) return false;
    throw error;
  }
}

export async function grantPdfUrl(event) {
  const grant = event.queryStringParameters?.grant;
  if (!grant) return badRequest('grant is required');
  if (!isGrantName(grant)) return notFound();

  try {
    const row = await readGrantRow(process.env.NOFO_METADATA_TABLE_NAME, grant);
    const viewer = grantViewerScope(event);
    if (!canViewGrant(viewer, row)) return notFound();
    if (IN_REVIEW_STATUSES.has(row?.status) && !opensGrantInReview(viewer, effectiveGrantScope(row), row?.state || null)) {
      return notFound();
    }

    const bucket = process.env.NOFO_BUCKET;
    const pdfKey = `${grant}/NOFO-File-PDF`;
    if (!(await exists(bucket, pdfKey))) {
      return (await exists(bucket, `${grant}/NOFO-File-TXT`)) ? success({ available: false }) : notFound();
    }

    const asciiName = `${grant}.pdf`.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const signedUrl = await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: bucket,
        Key: pdfKey,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(`${grant}.pdf`)}`,
      }),
      { expiresIn: URL_EXPIRATION_SECONDS }
    );
    return success({ available: true, signedUrl });
  } catch (e) {
    console.error('Error generating the grant PDF URL:', e.message);
    return serverError('Unable to generate download URL');
  }
}
