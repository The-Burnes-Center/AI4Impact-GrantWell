/**
 * This Lambda function deletes a NOFO folder and all its contents from S3.
 * It accepts a folder name in the request body and deletes all objects with that prefix.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    // Parse the request body to get the folder name to delete
    const requestBody = JSON.parse(event.body);
    const { nofoName } = requestBody;

    // Validate input
    if (!nofoName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing 'nofoName' in request body" }),
      };
    }

    // List all objects in the folder
    let objects = [];
    let continuationToken = undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: `${nofoName}/`,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);
      if (response.Contents && response.Contents.length > 0) {
        objects = [...objects, ...response.Contents];
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    if (objects.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: `Folder '${nofoName}' not found or already deleted` }),
      };
    }

    // Delete all objects in the folder
    for (const object of objects) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: object.Key,
      });

      await s3Client.send(deleteCommand);
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `Successfully deleted folder '${nofoName}' and all its contents (${objects.length} objects)`,
      }),
    };
  } catch (error) {
    console.error("Error deleting NOFO folder:", error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to delete NOFO folder. Internal Server Error.',
        error: error.message,
      }),
    };
  }
}; 