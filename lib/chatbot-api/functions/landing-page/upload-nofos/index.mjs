/**
 * This Lambda function generates a presigned URL for uploading objects to an S3 bucket.
 * It directly calls a helper function to generate the presigned URL without checking user roles.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const URL_EXPIRATION_SECONDS = 300; // URL valid for 5 minutes

// Main Lambda entry point
export const handler = async (event) => {
  try {
    // Directly call the helper function without checking roles
    return await getUploadURL(event); 
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'An error occurred while generating the upload URL',
      }),
    };
  }
};

// Helper function to generate a presigned upload URL for S3
const getUploadURL = async function (event) {
  const body = JSON.parse(event.body); // Parse the incoming request body
  const fileName = body.fileName; // Retrieve the file name
  const fileType = body.fileType; // Retrieve the file type

  const s3Params = {
    Bucket: process.env.BUCKET, // S3 bucket name from environment variables
    Key: fileName, // S3 object key (filename)
    ContentType: fileType, // MIME type of the file
  };

  const s3 = new S3Client({ region: 'us-east-1' }); // Initialize S3 client
  const command = new PutObjectCommand(s3Params); // Create PutObjectCommand with given params

  try {
    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: URL_EXPIRATION_SECONDS, // Set URL expiration time
    });
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ signedUrl }),
    };
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to generate signed URL' }),
    };
  }
};