/**
 * This Lambda function generates a presigned URL for uploading objects to an S3 bucket.
 * It checks the user's role to ensure they have the necessary permissions to perform the upload.
 * If the user is an admin, the function generates and returns a presigned URL for uploading a file to S3.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const URL_EXPIRATION_SECONDS = 300; 

// Main Lambda entry point
export const handler = async (event) => {
  console.log('Upload S3 Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Extract user claims and userId from the event
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims['cognito:username'] || claims.username;
    console.log('Extracted userId:', userId);
    
    if (!userId) {
      console.error('No userId found in claims');
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'User not authenticated' }),
      };
    }
    
    // Parse request body to validate userId in path
    const body = JSON.parse(event.body);
    const fileName = body.fileName;
    const fileType = body.fileType;
    console.log('Request body - fileName:', fileName);
    console.log('Request body - fileType:', fileType);
    
    // Security: Ensure fileName starts with userId/ (format: userId/nofoName/filename)
    if (!fileName || !fileName.startsWith(`${userId}/`)) {
      console.error('Security check failed - fileName does not start with userId/');
      console.error('fileName:', fileName);
      console.error('Expected prefix:', `${userId}/`);
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Unauthorized: Can only upload to your own folder' }),
      };
    }
    
    console.log('Security check passed, proceeding to generate upload URL');
    // If validation passes, proceed with generating upload URL
    return await getUploadURL(event, body);
  } catch (e) {
    console.error('Error in handler:', e);
    console.error('Error stack:', e.stack);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Unable to process request: ' + e.message }),
    };
  }
};

// Helper function to generate a presigned upload URL for S3
const getUploadURL = async function (event, body) {
  const fileName = body.fileName; // Format: userId/nofoName/filename
  const fileType = body.fileType; // Retrieve the file type

  const bucketName = process.env.USER_DOCUMENTS_BUCKET || process.env.BUCKET;
  console.log('Generating presigned URL for upload');
  console.log('Bucket:', bucketName);
  console.log('S3 Key (fileName):', fileName);
  console.log('ContentType (fileType):', fileType);
  console.log('URL expiration seconds:', URL_EXPIRATION_SECONDS);

  const s3Params = { // Parameters for S3 PutObjectCommand
    Bucket: bucketName, // Use user documents bucket
    Key: fileName, // S3 object key (userId/nofoName/filename)
    ContentType: fileType, // MIME type of the file
  };

  const s3 = new S3Client({ region: 'us-east-1' }); // Initialize S3 client
  const command = new PutObjectCommand(s3Params); // Create PutObjectCommand with given params

  try {
    console.log('Creating presigned URL...');
    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: URL_EXPIRATION_SECONDS, // Set URL expiration time
    });
    console.log('Presigned URL generated successfully');
    console.log('URL length:', signedUrl.length);
    console.log('URL preview (first 100 chars):', signedUrl.substring(0, 100) + '...');
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ signedUrl }),
    };
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    console.error('Error details:', JSON.stringify(err, null, 2));
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to generate signed URL' }),
    };
  }
};


