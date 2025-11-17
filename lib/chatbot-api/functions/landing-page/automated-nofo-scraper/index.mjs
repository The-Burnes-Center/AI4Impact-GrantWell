/**
 * Automated NOFO Scraper Lambda Function
 * 
 * This function automatically fetches new grant opportunities from Simpler.Grants.gov API,
 * downloads their attachments, and uploads them to S3 for processing.
 * It integrates with the existing NOFO processing pipeline.
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const S3_BUCKET = process.env.BUCKET;
const RATE_LIMIT_DELAY = 250; // milliseconds
const OPPORTUNITIES_PER_PAGE = 25; // Grants.gov API returns 25 per page

/**
 * Fetches opportunity IDs from Simpler.Grants.gov API
 */
async function fetchOpportunityIDs(pageNumber = 1) {
  try {
    const requestBody = {
      filters: {
        opportunity_status: {
          one_of: ['posted']
        },
        funding_instrument: {
          one_of: ['grant']
        }
      },
      pagination: {
        page_offset: pageNumber,
        page_size: OPPORTUNITIES_PER_PAGE,
        sort_order: [
          {
            order_by: "opportunity_id",
            sort_direction: "descending" // Get newest first
          }
        ]
      }
    };

    const response = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const opportunities = data?.data || [];

    return opportunities;
  } catch (error) {
    console.error(`Error fetching opportunities page ${pageNumber}:`, error.message);
    throw error;
  }
}

/**
 * Fetches detailed information for a single opportunity
 */
async function fetchOpportunityDetails(opportunityId) {
  try {
    const response = await fetch(`https://api.simpler.grants.gov/v1/opportunities/${opportunityId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'X-API-Key': API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Details API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const opportunityData = data?.data;
    
    if (!opportunityData) {
      return null;
    }

    const attachments = (opportunityData.attachments || []).filter(att => !!att.download_path);
    
    if (attachments.length === 1) {
      const result = {
        opportunity_id: opportunityData.opportunity_id,
        opportunity_title: opportunityData.opportunity_title,
        download_path: attachments[0].download_path,
        file_description: attachments[0].file_description || '',
        posted_date: opportunityData.posted_date,
        close_date: opportunityData.close_date,
        agency_name: opportunityData.agency_name
      };
      
      return result;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching details for ${opportunityId}:`, error.message);
    return null;
  }
}

/**
 * Downloads a file from a URL and returns it as a buffer
 */
async function downloadFile(url) {
  try {
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return buffer;
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Checks if a NOFO already exists in S3
 */
async function nofoExistsInS3(opportunityTitle, s3Client) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `${opportunityTitle}/`,
      MaxKeys: 1
    });
    
    const result = await s3Client.send(command);
    const exists = result.Contents && result.Contents.length > 0;
    
    return exists;
  } catch (error) {
    console.error(`Error checking if NOFO exists: ${opportunityTitle}`, error.message);
    return false;
  }
}

/**
 * Uploads a file to S3
 */
async function uploadToS3(key, fileBuffer, contentType, s3Client) {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType
    });
    
    await s3Client.send(command);
  } catch (error) {
    console.error(`Error uploading to S3: ${key}`, error.message);
    throw error;
  }
}

/**
 * Sleep function for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main handler function
 */
export const handler = async (event) => {
  const s3Client = new S3Client({ region: 'us-east-1' });
  const processedOpportunities = [];
  const errors = [];
  let totalOpportunities = 0;
  let pageNumber = 1;

  try {
    // Validate environment variables
    if (!API_KEY) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is not set');
    }
    
    if (!S3_BUCKET) {
      throw new Error('BUCKET environment variable is not set');
    }
    
    // Process all available pages of opportunities
    while (true) {
      try {
        const opportunities = await fetchOpportunityIDs(pageNumber);
        
        if (opportunities.length === 0) {
          break; // No more opportunities to process
        }
        
        totalOpportunities += opportunities.length;
        
        // Process each opportunity on this page
        for (const opportunity of opportunities) {
          const opportunityId = opportunity.opportunity_id;
          const opportunityTitle = opportunity.opportunity_title;
          
          try {
            // Check if NOFO already exists
            const exists = await nofoExistsInS3(opportunityTitle, s3Client);
            if (exists) {
              continue; // Skip if already exists
            }

            // Fetch detailed information
            const details = await fetchOpportunityDetails(opportunityId);
            if (!details) {
              continue; // Skip if no single attachment
            }

            // Download the file
            const fileBuffer = await downloadFile(details.download_path);
            
            // Determine file extension and content type
            const urlParts = details.download_path.split('.');
            const extension = urlParts[urlParts.length - 1].toLowerCase();
            
            // Only process PDF and HTML files, skip everything else
            if (extension !== 'pdf' && extension !== 'html') {
              console.log(`Skipping opportunity ${opportunityTitle}: unsupported file type ${extension}`);
              continue; // Skip if not PDF or HTML
            }
            
            let s3Key;
            let contentType;
            let fileName;
            let status = 'success';
            
            if (extension === 'html') {
              // Upload HTML to pending-conversion prefix - Lambda will convert it to PDF
              s3Key = `pending-conversion/${opportunityTitle}/NOFO-File-HTML.html`;
              contentType = 'text/html';
              fileName = 'NOFO-File-HTML.html';
              status = 'pending_conversion'; // HTML uploaded, PDF conversion pending
              
              // Upload HTML file - the Lambda will be triggered automatically
              await uploadToS3(s3Key, fileBuffer, contentType, s3Client);
              
              processedOpportunities.push({
                opportunity_id: opportunityId,
                opportunity_title: details.opportunity_title,
                status: status,
                s3Key: s3Key
              });
              
              // Rate limiting between opportunities
              await sleep(RATE_LIMIT_DELAY);
              continue; // Skip to next opportunity
            } else {
              // PDF file - upload directly to final location
              s3Key = `${opportunityTitle}/NOFO-File-PDF`;
              contentType = 'application/pdf';
              fileName = 'NOFO-File-PDF';
            }
            
            // Upload to S3 (for PDF files)
            await uploadToS3(s3Key, fileBuffer, contentType, s3Client);
            
            processedOpportunities.push({
              opportunity_id: opportunityId,
              opportunity_title: details.opportunity_title,
              status: status
            });
            
            // Rate limiting between opportunities
            await sleep(RATE_LIMIT_DELAY);
            
          } catch (error) {
            console.error(`Error processing opportunity ${opportunityTitle}:`, error.message);
            
            errors.push({
              opportunity_id: opportunityId,
              opportunity_title: opportunityTitle,
              error: error.message,
              errorType: error.constructor.name
            });
          }
        }
        
        // Rate limiting between pages
        await sleep(RATE_LIMIT_DELAY * 2);
        pageNumber++;
        
      } catch (error) {
        console.error(`Error processing page ${pageNumber}:`, error.message);
        errors.push({
          page: pageNumber,
          error: error.message,
          errorType: error.constructor.name
        });
        break; // Stop processing if page fails
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Automated NOFO scraping completed',
        totalChecked: totalOpportunities,
        processed: processedOpportunities.length,
        errors: errors.length,
        processedOpportunities,
        errors,
        pagesProcessed: pageNumber - 1
      }),
    };

  } catch (error) {
    console.error('Fatal error in automated NOFO scraper:', error.message);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error in automated NOFO scraping',
        error: error.message,
        errorType: error.constructor.name
      }),
    };
  }
}; 