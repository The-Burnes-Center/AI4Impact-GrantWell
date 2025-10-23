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
    // First, get all folders in the bucket and count files in each
    let allFolders = [];
    let continuationToken = undefined;

    do {
      // List all objects in the S3 bucket with pagination
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
        Delimiter: '/' // This helps identify folders
      });

      const result = await s3Client.send(command);
      
      // Get common prefixes (folders)
      if (result.CommonPrefixes && result.CommonPrefixes.length > 0) {
        allFolders = [...allFolders, ...result.CommonPrefixes.map(prefix => prefix.Prefix.slice(0, -1))];
      }
      
      // Check if there are more objects to retrieve
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    // Filter folders that have at least 3 files
    const foldersWithMinFiles = [];
    for (const folder of allFolders) {
      try {
        const folderCommand = new ListObjectsV2Command({
          Bucket: s3Bucket,
          Prefix: `${folder}/`,
        });
        
        const folderResult = await s3Client.send(folderCommand);
        const fileCount = folderResult.Contents ? folderResult.Contents.length : 0;
        
        console.log(`Folder ${folder} has ${fileCount} files`);
        
        // Only include folders with at least 3 files (original NOFO + summary.json + questions.json)
        if (fileCount >= 3) {
          foldersWithMinFiles.push(folder);
        } else {
          console.log(`Skipping folder ${folder} - only has ${fileCount} files (minimum 3 required)`);
        }
      } catch (error) {
        console.warn(`Error checking file count for folder ${folder}:`, error);
        // Skip folders that can't be checked
      }
    }

    console.log(`Found ${foldersWithMinFiles.length} folders with minimum 3 files out of ${allFolders.length} total folders`);

    // Now, get all summary.json files from folders that meet the file count requirement
    let summaryFiles = [];
    continuationToken = undefined;

    do {
      // List objects in the S3 bucket with pagination
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
      });

      const result = await s3Client.send(command);
      
      if (result.Contents) {
        // Filter objects that end with 'summary.json' and are in folders with minimum files
        const summaryObjects = result.Contents.filter((item) => {
          if (!item.Key.endsWith('summary.json')) return false;
          
          const folderName = item.Key.substring(0, item.Key.lastIndexOf('/'));
          return foldersWithMinFiles.includes(folderName);
        });

        // Add summary file paths to array
        summaryFiles = [...summaryFiles, ...summaryObjects.map(item => item.Key)];
      }

      // Check if there are more objects to retrieve
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    // Get status information for each folder by reading the summary.json files
    let nofoData = await Promise.all(
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
          
          // Log the retrieved status
          console.log(`Retrieved status for ${folderName}: ${summary.status || 'active (default)'}`);
          
          // Return folder with status, default to 'active' if not specified
          return {
            name: folderName,
            status: summary.status || 'active',
            isPinned: summary.isPinned || false
          };
        } catch (error) {
          console.warn(`Error reading summary for ${folderName}:`, error);
          // Return folder with default status if summary can't be read
          return {
            name: folderName,
            status: 'active',
            isPinned: false
          };
        }
      })
    );
    
    // Check for folders without summary.json files but with minimum file count and add them with default status
    const foldersWithSummary = nofoData.map(nofo => nofo.name);
    const foldersWithoutSummary = foldersWithMinFiles.filter(folder => !foldersWithSummary.includes(folder));
    
    console.log(`Found ${foldersWithoutSummary.length} folders without summary.json but with minimum 3 files, adding with default 'active' status`);
    
    // Add missing folders with default status (only those that meet file count requirement)
    const additionalNofos = foldersWithoutSummary.map(folder => ({
      name: folder,
      status: 'active', // Default status for folders without summary.json
      isPinned: false
    }));
    
    // Combine all NOFOs
    nofoData = [...nofoData, ...additionalNofos];
    
    console.log(`Total NOFOs to return: ${nofoData.length}`);
    console.log('NOFO statuses:', nofoData.map(nofo => `${nofo.name}: ${nofo.status}`).join(', '));
    
    // Filter out archived NOFOs for the landing page
    const activeNofos = nofoData.filter(nofo => nofo.status === 'active');
    console.log(`Active NOFOs: ${activeNofos.length}, Archived NOFOs: ${nofoData.length - activeNofos.length}`);
    
    // Return the list of folders with their status
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', 
      },
      body: JSON.stringify({ 
        // Only include active NOFOs in the folders array
        folders: activeNofos.map(nofo => nofo.name),
        // Include all NOFOs with status info for admin dashboard
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
