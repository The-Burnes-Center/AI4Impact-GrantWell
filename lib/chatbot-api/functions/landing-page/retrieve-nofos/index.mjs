/**
 * This Lambda function retrieves folders from an S3 bucket that contain a 'summary.json' file.
 * It lists objects in the S3 bucket, filters for 'summary.json' files, and returns the folder paths
 * along with their status (active or archived).
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// Convert a ReadableStream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET; 
  const s3Client = new S3Client();

  try {
    let summaryFiles = [];
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

      // Add summary file paths to array
      summaryFiles = [...summaryFiles, ...summaryObjects.map(item => item.Key)];

      // Check if there are more objects to retrieve
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    // Get status information for each folder by reading the summary.json files
    const nofoData = await Promise.all(
      summaryFiles.map(async (summaryFile) => {
        const folderName = summaryFile.substring(0, summaryFile.lastIndexOf('/'));
        
        try {
          // Get the summary.json file content
          const getCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: summaryFile,
          });
          
          const result = await s3Client.send(getCommand);
          const fileContent = await streamToString(result.Body);
          const summary = JSON.parse(fileContent);
          
          // Return folder with status, default to 'active' if not specified
          return {
            name: folderName,
            status: summary.status || 'active'
          };
        } catch (error) {
          console.warn(`Error reading summary for ${folderName}:`, error);
          // Return folder with default status if summary can't be read
          return {
            name: folderName,
            status: 'active'
          };
        }
      })
    );
    
    // Return the list of folders with their status
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', 
      },
      body: JSON.stringify({ 
        folders: nofoData.map(nofo => nofo.name),
        nofoData: nofoData 
      }), 
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
