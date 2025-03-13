/**
 * This Lambda function retrieves objects from an S3 bucket.
 * It checks the user's role to ensure they have the necessary permissions to perform the retrieval.
 * If the user is an admin, the function lists the objects in the specified S3 bucket folder.
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Client = new S3Client();
  
  const body = JSON.parse(event.body);
  const folderPrefix = body.folderPrefix || '';

  try {
    // Extract user claims and roles from the event
    const claims = event.requestContext.authorizer.jwt.claims;
    const roles = JSON.parse(claims['custom:role']);
    if (!roles.includes("Admin")) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'User is not authorized to perform this action' }),
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.' }),
    };
  }

  const { continuationToken, pageIndex } = event;
  const s3Bucket = process.env.BUCKET;
  
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
