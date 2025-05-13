/**
 * This Lambda function renames a NOFO folder in S3.
 * It accepts old and new folder names in the request body,
 * copies all objects from the old folder to the new folder with the same structure,
 * then deletes the original folder.
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    // Parse the request body to get the old and new folder names
    const requestBody = JSON.parse(event.body);
    const { oldName, newName } = requestBody;

    // Validate input
    if (!oldName || !newName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Both 'oldName' and 'newName' are required in request body" }),
      };
    }

    // List all objects in the old folder
    let objects = [];
    let continuationToken = undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: `${oldName}/`,
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
        body: JSON.stringify({ message: `Folder '${oldName}' not found or empty` }),
      };
    }

    // Copy each object to the new folder
    for (const object of objects) {
      const sourceKey = object.Key;
      const destinationKey = sourceKey.replace(`${oldName}/`, `${newName}/`);

      // Copy object to new location
      const copyCommand = new CopyObjectCommand({
        Bucket: s3Bucket,
        CopySource: `${s3Bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      await s3Client.send(copyCommand);
    }

    // Delete objects from the old folder after successful copy
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
        message: `Successfully renamed folder from '${oldName}' to '${newName}'`,
      }),
    };
  } catch (error) {
    console.error("Error renaming NOFO folder:", error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to rename NOFO folder. Internal Server Error.',
        error: error.message,
      }),
    };
  }
}; 