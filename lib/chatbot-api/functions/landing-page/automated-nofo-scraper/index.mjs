/**
 * Automated NOFO Scraper Lambda Function
 * 
 * This function automatically fetches new grant opportunities from Simpler.Grants.gov API,
 * downloads their attachments, and uploads them to S3 for processing.
 * It integrates with the existing NOFO processing pipeline.
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import axios from 'axios';
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
    const response = await axios.post(
      'https://api.simpler.grants.gov/v1/opportunities/search',
      {
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
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth': API_KEY
        }
      }
    );

    return response.data?.data || [];
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
    const response = await axios.get(
      `https://api.simpler.grants.gov/v1/opportunities/${opportunityId}`,
      {
        headers: {
          'accept': 'application/json',
          'X-Auth': API_KEY
        }
      }
    );

    const data = response.data?.data;
    if (!data) return null;

    const attachments = (data.attachments || []).filter(att => !!att.download_path);
    
    if (attachments.length === 1) {
      return {
        opportunity_id: data.opportunity_id,
        opportunity_title: data.opportunity_title,
        download_path: attachments[0].download_path,
        file_description: attachments[0].file_description || '',
        posted_date: data.posted_date,
        close_date: data.close_date,
        agency_name: data.agency_name
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching opportunity ${opportunityId}:`, error.message);
    return null;
  }
}

/**
 * Downloads a file from a URL and returns it as a buffer
 */
async function downloadFile(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Checks if a NOFO already exists in S3
 */
async function nofoExistsInS3(opportunityId, s3Client) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `${opportunityId}/`,
      MaxKeys: 1
    });
    
    const result = await s3Client.send(command);
    return result.Contents && result.Contents.length > 0;
  } catch (error) {
    console.error(`Error checking if NOFO exists:`, error.message);
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
    console.log(`Successfully uploaded ${key} to S3`);
  } catch (error) {
    console.error(`Error uploading ${key} to S3:`, error.message);
    throw error;
  }
}

/**
 * Main handler function
 */
export const handler = async (event) => {
  const s3Client = new S3Client({ region: 'us-east-1' });
  const processedOpportunities = [];
  const errors = [];
  let totalOpportunities = 0;

  try {
    console.log('Starting automated NOFO scraping (TEST MODE - 1 grant only)...');
    
    // Fetch only the first page for testing
    console.log('Fetching first page for testing...');
    const opportunities = await fetchOpportunityIDs(1);
    
    if (opportunities.length === 0) {
      console.log('No opportunities found on first page');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          message: 'No opportunities found to process',
          totalChecked: 0,
          processed: 0,
          errors: 0,
          processedOpportunities: [],
          errors: []
        }),
      };
    }
    
    // Process only the FIRST opportunity for testing
    const testOpportunity = opportunities[0];
    const opportunityId = testOpportunity.opportunity_id;
    totalOpportunities = 1;
    
    console.log(`TEST MODE: Processing only 1 opportunity: ${opportunityId}`);
    
    try {
      // Check if NOFO already exists
      const exists = await nofoExistsInS3(opportunityId, s3Client);
      if (exists) {
        console.log(`NOFO ${opportunityId} already exists, skipping`);
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            message: 'Test opportunity already exists in S3',
            totalChecked: 1,
            processed: 0,
            errors: 0,
            processedOpportunities: [],
            errors: []
          }),
        };
      }

      // Fetch detailed information
      console.log(`Fetching details for ${opportunityId}...`);
      const details = await fetchOpportunityDetails(opportunityId);
      if (!details) {
        console.log(`No single attachment found for ${opportunityId}, skipping`);
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            message: 'Test opportunity has no single attachment',
            totalChecked: 1,
            processed: 0,
            errors: 0,
            processedOpportunities: [],
            errors: []
          }),
        };
      }

      // Download the file
      console.log(`Downloading file for ${opportunityId}...`);
      const fileBuffer = await downloadFile(details.download_path);
      
      // Determine file extension and content type
      const urlParts = details.download_path.split('.');
      const extension = urlParts[urlParts.length - 1].toLowerCase();
      const contentType = extension === 'pdf' ? 'application/pdf' : 'text/plain';
      const fileName = extension === 'pdf' ? 'NOFO-File-PDF' : 'NOFO-File-TXT';
      
      // Upload to S3
      const s3Key = `${opportunityId}/${fileName}`;
      console.log(`Uploading ${s3Key} to S3...`);
      await uploadToS3(s3Key, fileBuffer, contentType, s3Client);
      
      // Create and upload summary.json with initial metadata
      const summaryData = {
        opportunity_id: details.opportunity_id,
        opportunity_title: details.opportunity_title,
        agency_name: details.agency_name,
        posted_date: details.posted_date,
        close_date: details.close_date,
        file_description: details.file_description,
        status: 'active',
        isPinned: false,
        scraped_date: new Date().toISOString(),
        source: 'automated-scraper-test'
      };
      
      const summaryKey = `${opportunityId}/summary.json`;
      console.log(`Uploading ${summaryKey} to S3...`);
      await uploadToS3(
        summaryKey, 
        Buffer.from(JSON.stringify(summaryData, null, 2)), 
        'application/json', 
        s3Client
      );
      
      processedOpportunities.push({
        opportunity_id: opportunityId,
        opportunity_title: details.opportunity_title,
        status: 'success'
      });
      
      console.log(`✅ TEST SUCCESS: Successfully processed ${opportunityId}`);
      
    } catch (error) {
      console.error(`Error processing test opportunity ${opportunityId}:`, error.message);
      errors.push({
        opportunity_id: opportunityId,
        error: error.message
      });
    }

    console.log(`Test completed. Total checked: ${totalOpportunities}, Processed: ${processedOpportunities.length}, Errors: ${errors.length}`);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Test NOFO scraping completed (1 grant only)',
        totalChecked: totalOpportunities,
        processed: processedOpportunities.length,
        errors: errors.length,
        processedOpportunities,
        errors,
        testMode: true
      }),
    };

  } catch (error) {
    console.error('Fatal error in test NOFO scraper:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error in test NOFO scraping',
        error: error.message,
        testMode: true
      }),
    };
  }
}; 