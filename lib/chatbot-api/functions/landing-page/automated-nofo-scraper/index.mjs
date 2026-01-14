/**
 * Automated NOFO Scraper Lambda Function
 * 
 * This function automatically fetches new grant opportunities from Simpler.Grants.gov API,
 * downloads their attachments, and uploads them to S3 for processing.
 * It integrates with the existing NOFO processing pipeline.
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const S3_BUCKET = process.env.BUCKET;
const RATE_LIMIT_DELAY = 250; // milliseconds
const OPPORTUNITIES_PER_PAGE = 25; // Grants.gov API returns 25 per page
const CLAUDE_MODEL_ID = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

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
          one_of: ['grant','cooperative_agreement']
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
 * Uses Bedrock to identify which attachment is the NOFO file from multiple attachments
 */
async function identifyNOFOFile(attachments) {
  try {
    const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
    
    // Prepare attachment information for the prompt
    const attachmentInfo = attachments.map((att, index) => ({
      index: index + 1,
      filename: att.download_path ? att.download_path.split('/').pop() : 'unknown',
      description: att.file_description || 'No description available',
      download_path: att.download_path || ''
    }));

    const prompt = `You are analyzing grant opportunity attachments to identify which file is the Notice of Funding Opportunity (NOFO) document.

The NOFO is typically:
- The main funding announcement document
- Contains eligibility requirements, application instructions, and deadlines
- Usually has names like "NOFO", "Funding Opportunity", "Grant Announcement", "RFA" (Request for Applications), "RFP" (Request for Proposals), or similar
- May be a PDF or HTML file
- Usually the primary document, not supplementary materials like forms, FAQs, or appendices

Here are the attachments:
${JSON.stringify(attachmentInfo, null, 2)}

Analyze the filenames and descriptions to identify which attachment is most likely the NOFO file.

Return your response as a JSON object with this exact format:
{
  "nofoIndex": <number between 1 and ${attachments.length}>,
  "reason": "<brief explanation of why this file is the NOFO>"
}

Return ONLY the JSON object, no additional text or explanation.`;

    const bedrockParams = {
      modelId: CLAUDE_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    };

    const command = new InvokeModelCommand(bedrockParams);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    
    const content = responseBody.content[0].text;
    
    // Extract JSON from the response (in case there's extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const nofoIndex = result.nofoIndex;
      
      // Validate the index is within range
      if (nofoIndex >= 1 && nofoIndex <= attachments.length) {
        return {
          attachment: attachments[nofoIndex - 1],
          reason: result.reason
        };
      } else {
        console.error(`Invalid NOFO index ${nofoIndex} returned by Bedrock`);
        return null;
      }
    } else {
      console.error('Failed to extract JSON from Bedrock response:', content);
      return null;
    }
  } catch (error) {
    console.error('Error identifying NOFO file with Bedrock:', error.message);
    return null;
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
    
    let selectedAttachment;
    let nofoIdentificationReason = null;
    let isAdditionalInfoUrl = false;
    
    if (attachments.length === 0) {
      // No attachments - check for additional_info_url
      const additionalInfoUrl = opportunityData.summary?.additional_info_url;
      
      if (!additionalInfoUrl) {
        return null; // No attachments and no additional_info_url
      }
      
      // Create a pseudo-attachment object using additional_info_url
      selectedAttachment = {
        download_path: additionalInfoUrl,
        file_description: opportunityData.summary?.additional_info_url_description || 'Additional Information URL'
      };
      nofoIdentificationReason = 'Using additional_info_url (no attachments available)';
      isAdditionalInfoUrl = true;
      console.log(`No attachments found for opportunity ${opportunityId}, using additional_info_url: ${additionalInfoUrl}`);
    } else if (attachments.length === 1) {
      // Single attachment - use it directly
      selectedAttachment = attachments[0];
    } else {
      // Multiple attachments - use Bedrock to identify the NOFO file
      console.log(`Multiple attachments found for opportunity ${opportunityId}, using Bedrock to identify NOFO file`);
      const identificationResult = await identifyNOFOFile(attachments);
      
      if (!identificationResult) {
        console.log(`Failed to identify NOFO file for opportunity ${opportunityId}, skipping`);
        return null;
      }
      
      selectedAttachment = identificationResult.attachment;
      nofoIdentificationReason = identificationResult.reason;
      console.log(`Identified NOFO file: ${selectedAttachment.download_path.split('/').pop()}, Reason: ${nofoIdentificationReason}`);
    }
    
    const result = {
      opportunity_id: opportunityData.opportunity_id,
      opportunity_title: opportunityData.opportunity_title,
      download_path: selectedAttachment.download_path,
      file_description: selectedAttachment.file_description || '',
      posted_date: opportunityData.posted_date,
      close_date: opportunityData.close_date,
      agency_name: opportunityData.agency_name,
      nofo_identification_reason: nofoIdentificationReason,
      is_additional_info_url: isAdditionalInfoUrl
    };
    
    return result;
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
              continue; // Skip if no attachments or failed to identify NOFO file
            }

            // Download the file
            const fileBuffer = await downloadFile(details.download_path);
            
            // Determine file extension and content type
            let extension;
            if (details.is_additional_info_url) {
              // Treat additional_info_url as HTML
              extension = 'html';
            } else {
              const urlParts = details.download_path.split('.');
              extension = urlParts[urlParts.length - 1].toLowerCase();
            }
            
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
            
            // Write to DynamoDB if enabled (for PDF files - HTML files will be handled by processAndSummarizeNOFO)
            const tableName = process.env.NOFO_METADATA_TABLE_NAME;
            const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
            
            if (enableDynamoDBCache && tableName && extension === 'pdf') {
              try {
                const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
                const now = new Date().toISOString();
                
                const item = {
                  nofo_name: opportunityTitle,
                  status: 'active', // Default status for new NOFOs
                  isPinned: 'false',
                  created_at: now,
                  updated_at: now,
                };

                const putCommand = new PutItemCommand({
                  TableName: tableName,
                  Item: marshall(item),
                });

                await dynamoClient.send(putCommand);
                console.log(`Successfully wrote NOFO metadata to DynamoDB for ${opportunityTitle}`);
              } catch (error) {
                console.error(`Failed to write to DynamoDB for ${opportunityTitle}:`, error);
                // Continue execution - S3 is the source of truth, and processAndSummarizeNOFO will handle it
              }
            }
            
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