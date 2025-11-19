/**
 * This Lambda function retrieves objects from an S3 bucket.
 * It checks the user's role to ensure they have the necessary permissions to perform the retrieval.
 * If the user is an admin, the function lists the objects in the specified S3 bucket folder.
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Client = new S3Client();
  
  const body = JSON.parse(event.body);
  const folderPrefix = body.folderPrefix || ''; // Format: userId/nofoName/

  try {
    // Extract user claims and userId from the event
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims['cognito:username'] || claims.username;
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'User not authenticated' }),
      };
    }
    
    // Security: Ensure folderPrefix starts with userId/ (format: userId/nofoName/)
    if (!folderPrefix.startsWith(`${userId}/`)) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Unauthorized: Can only access your own folder' }),
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Unable to process request: ' + e.message }),
    };
  }

  const { continuationToken, pageIndex } = event;
  const s3Bucket = process.env.USER_DOCUMENTS_BUCKET || process.env.BUCKET;
  
  try {
    const command = new ListObjectsV2Command({
      Bucket: s3Bucket,
      Prefix: folderPrefix,
      Delimiter: '/',
      ContinuationToken: continuationToken,
    });

    const result = await s3Client.send(command);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Get S3 Bucket data failed - Internal Server Error' }),
    };
  }
};
