/**
 * This Lambda function retrieves folders from an S3 bucket that contain a 'summary.json' file.
 * It lists objects in the S3 bucket, filters for 'summary.json' files, and returns the folder paths.
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET; 
  const s3Client = new S3Client();

  try {
    let foldersWithSummary = [];
    let continuationToken = undefined;

    do {
      // List objects in the S3 bucket with pagination
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
      });

      const result = await s3Client.send(command);

      // Filter objects that end with 'summary.json'
      const summaryObjects = result.Contents.filter(
        (item) => item.Key.endsWith('summary.json')
      );

      // Extract folder paths from the object keys
      summaryObjects.forEach((item) => {
        // Remove 'summary.json' from the key to get the folder path
        const folderPath = item.Key.substring(0, item.Key.lastIndexOf('/'));
        foldersWithSummary.push(folderPath);
      });

      // Check if there are more objects to retrieve
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    // Remove duplicates if any
    foldersWithSummary = [...new Set(foldersWithSummary)];
    
    // Return the list of folders with a successful status
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', 
      },
      body: JSON.stringify({ folders: foldersWithSummary }), 
    };

  } catch (error) {
    console.error("Error fetching data from S3:", error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to retrieve data from S3. Internal Server Error.',
        error: error.message,
      }),
    };
  }
};
