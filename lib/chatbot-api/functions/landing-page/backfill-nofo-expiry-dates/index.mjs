/**
 * Backfill NOFO Expiry Dates Lambda Function
 * 
 * This function backfills expiration dates for NOFOs by fetching the close_date
 * from the Grants.gov API and updating it in DynamoDB.
 * 
 * It can be run in two modes:
 * 1. Backfill all NOFOs in DynamoDB (default)
 * 2. Backfill specific NOFOs by opportunity IDs (via event body)
 */

import { DynamoDBClient, UpdateItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const RATE_LIMIT_DELAY = 250; // milliseconds

/**
 * Fetches detailed information for a single opportunity from Grants.gov API
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

    // Extract close_date from summary.close_date (primary source)
    // Fallback to competitions[0].closing_date if summary doesn't have it
    let closeDate = opportunityData.summary?.close_date;
    
    if (!closeDate && opportunityData.competitions && opportunityData.competitions.length > 0) {
      // Use the first competition's closing_date as fallback
      closeDate = opportunityData.competitions[0].closing_date;
    }

    return {
      opportunity_id: opportunityData.opportunity_id,
      opportunity_title: opportunityData.opportunity_title,
      close_date: closeDate,
    };
  } catch (error) {
    console.error(`Error fetching details for ${opportunityId}:`, error.message);
    return null;
  }
}

/**
 * Normalizes a title for comparison by replacing slashes with dashes
 * This handles the case where HTML-to-PDF converter replaces slashes with dashes
 */
function normalizeTitleForComparison(title) {
  if (!title) return '';
  return title.replace(/\//g, '-');
}

/**
 * Compares two titles, handling both slash and dash formats
 * Returns true if titles match (considering slash/dash conversion)
 */
function titlesMatch(title1, title2) {
  if (!title1 || !title2) return false;
  
  // Exact match
  if (title1 === title2) return true;
  
  // Match after normalizing (replacing slashes with dashes)
  const normalized1 = normalizeTitleForComparison(title1);
  const normalized2 = normalizeTitleForComparison(title2);
  
  return normalized1 === normalized2;
}

/**
 * Fetches all opportunities from Grants.gov API (paginated, like the scraper)
 */
async function fetchAllOpportunities() {
  const allOpportunities = [];
  let pageNumber = 1;
  const OPPORTUNITIES_PER_PAGE = 25;

  try {
    while (true) {
      const requestBody = {
        filters: {
          opportunity_status: {
            one_of: ['posted']
          },
          funding_instrument: {
            one_of: ['grant', 'cooperative_agreement']
          }
        },
        pagination: {
          page_offset: pageNumber,
          page_size: OPPORTUNITIES_PER_PAGE,
          sort_order: [
            {
              order_by: "opportunity_id",
              sort_direction: "descending"
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

      if (opportunities.length === 0) {
        break; // No more opportunities
      }

      allOpportunities.push(...opportunities);
      console.log(`Fetched page ${pageNumber}: ${opportunities.length} opportunities (total: ${allOpportunities.length})`);

      // Rate limiting between pages
      await sleep(RATE_LIMIT_DELAY);
      pageNumber++;
    }

    console.log(`Fetched ${allOpportunities.length} total opportunities from Grants.gov`);
    return allOpportunities;
  } catch (error) {
    console.error(`Error fetching opportunities:`, error.message);
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
 * Updates expiration_date in DynamoDB for a NOFO
 * If expiration_date is later than today, also sets status to 'active'
 */
async function updateExpirationDate(dynamoClient, tableName, nofoName, expirationDate) {
  try {
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    
    // Build update expression
    const updateExpressions = ['expiration_date = :expiration_date', 'updated_at = :updated_at'];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':expiration_date': expirationDate || null,
      ':updated_at': now,
    };
    
    // Check if expiration_date is later than today
    let shouldBeActive = false;
    if (expirationDate) {
      try {
        // Parse expiration date - it might be in YYYY-MM-DD format or ISO format
        const expirationDateObj = new Date(expirationDate);
        expirationDateObj.setHours(0, 0, 0, 0); // Set to start of day for comparison
        
        if (expirationDateObj > today) {
          shouldBeActive = true;
          updateExpressions.push('#status = :status');
          expressionAttributeNames['#status'] = 'status';
          expressionAttributeValues[':status'] = 'active';
          console.log(`Expiration date ${expirationDate} is later than today, setting status to active`);
        } else {
          console.log(`Expiration date ${expirationDate} is not later than today, keeping current status`);
        }
      } catch (dateError) {
        console.warn(`Could not parse expiration date ${expirationDate}:`, dateError.message);
        // Continue without status update if date parsing fails
      }
    }
    
    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    await dynamoClient.send(updateCommand);
    console.log(`Updated expiration_date for ${nofoName}: ${expirationDate}${shouldBeActive ? ' (status set to active)' : ''}`);
    return { success: true, statusUpdated: shouldBeActive };
  } catch (error) {
    console.error(`Error updating expiration_date for ${nofoName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main handler function
 */
export const handler = async (event) => {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
  
  const stats = {
    totalNofosInDb: 0,
    totalOpportunitiesFromApi: 0,
    matched: 0,
    updated: 0,
    statusActivated: 0,
    skippedNoCloseDate: 0,
    skippedNoMatch: 0,
    errors: 0,
    errorList: [],
  };

  try {
    // Validate environment variables
    if (!API_KEY) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is not set');
    }
    
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    // Step 1: Fetch all opportunities from Grants.gov API
    console.log('Fetching all opportunities from Grants.gov API...');
    const allOpportunities = await fetchAllOpportunities();
    stats.totalOpportunitiesFromApi = allOpportunities.length;

    // Step 2: Fetch all NOFOs from DynamoDB
    console.log('Fetching all NOFOs from DynamoDB...');
    
    let allNofos = [];
    let lastEvaluatedKey = null;
    
    do {
      const scanParams = {
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const scanCommand = new ScanCommand(scanParams);
      const result = await dynamoClient.send(scanCommand);
      
      if (result.Items) {
        const items = result.Items.map(item => unmarshall(item));
        allNofos = [...allNofos, ...items];
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    stats.totalNofosInDb = allNofos.length;
    console.log(`Found ${allNofos.length} NOFOs in DynamoDB`);

    // Step 3: Match NOFOs from DynamoDB with opportunities from API
    console.log('Matching NOFOs with opportunities...');
    
    for (const nofo of allNofos) {
      try {
        const nofoName = nofo.nofo_name;
        
        // Find matching opportunity in the API list by title (handles slash/dash conversion)
        const matchingOpportunity = allOpportunities.find(
          opp => titlesMatch(opp.opportunity_title, nofoName)
        );
        
        if (!matchingOpportunity) {
          stats.skippedNoMatch++;
          console.log(`No matching opportunity found for ${nofoName}`);
          continue;
        }
        
        stats.matched++;
        console.log(`Matched ${nofoName} with opportunity ${matchingOpportunity.opportunity_id}`);
        
        // Fetch full opportunity details to get close_date
        await sleep(RATE_LIMIT_DELAY);
        const details = await fetchOpportunityDetails(matchingOpportunity.opportunity_id);
        
        if (!details) {
          stats.errors++;
          stats.errorList.push({
            nofo: nofoName,
            error: 'Failed to fetch opportunity details',
          });
          continue;
        }

        // Verify that the NOFO from API matches the NOFO in our system
        // Compare opportunity_title from API with nofo_name from DynamoDB (handling slash/dash conversion)
        if (!titlesMatch(details.opportunity_title, nofoName)) {
          stats.errors++;
          stats.errorList.push({
            nofo: nofoName,
            error: `NOFO mismatch: API returned "${details.opportunity_title}" but DynamoDB has "${nofoName}"`,
          });
          console.log(`NOFO mismatch: API title "${details.opportunity_title}" does not match DynamoDB name "${nofoName}"`);
          continue;
        }

        if (!details.close_date) {
          stats.skippedNoCloseDate++;
          console.log(`No close_date found for ${nofoName}`);
          continue;
        }

        // Update expiration_date in DynamoDB
        // If expiration_date is later than today, status will be set to 'active'
        const updateResult = await updateExpirationDate(
          dynamoClient,
          tableName,
          nofoName,
          details.close_date
        );

        if (updateResult.success) {
          stats.updated++;
          if (updateResult.statusUpdated) {
            stats.statusActivated++;
          }
        } else {
          stats.errors++;
          stats.errorList.push({
            nofo: nofoName,
            error: updateResult.error,
          });
        }

      } catch (error) {
        stats.errors++;
        stats.errorList.push({
          nofo: nofo.nofo_name || 'unknown',
          error: error.message,
        });
        console.error(`Error processing NOFO ${nofo.nofo_name}:`, error);
      }
    }

    console.log('Backfill completed:', stats);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Backfill completed',
        stats,
      }),
    };

  } catch (error) {
    console.error('Fatal error in backfill:', error.message);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error in backfill',
        error: error.message,
        errorType: error.constructor.name,
        stats,
      }),
    };
  }
};
