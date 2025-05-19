// fetch_specific_fields.js - Script to fetch specific opportunity fields (single page only)

const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Configuration
const API_KEY = process.env.GRANTS_GOV_API_KEY;
const OUTPUT_FILE = 'grants_specific_fields.json';
const PAGE_SIZE = 25; // Number of opportunities per page

// Function to fetch opportunities (single page only)
async function fetchSpecificFields() {
  console.log('Fetching specific fields from Grants.gov API (single page only)...');
  
  let allOpportunities = [];
  const pageToFetch = 1; // Only fetch page 1
  
  console.log(`Fetching page ${pageToFetch}...`);
  
  try {
    // Make the API request with the correct format
    const response = await axios.post(
      'https://api.simpler.grants.gov/v1/opportunities/search',
      {
        pagination: {
          page_offset: pageToFetch,
          page_size: PAGE_SIZE,
          sort_order: [
            {
              order_by: "opportunity_id",
              sort_direction: "ascending"
            }
          ]
        }
      },
      {
        headers: {
          'X-Auth': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Check for error responses
    if (response.status !== 200) {
      console.error(`Error: Received status code ${response.status}`);
      return;
    }
    
    // Extract the data and pagination info
    const { data, pagination_info } = response.data;
    
    if (!data || !Array.isArray(data)) {
      console.error('Error: Unexpected response format');
      return;
    }
    
    // Process each opportunity to get detailed information
    console.log(`Found ${data.length} opportunities. Fetching detailed info...`);
    
    for (let i = 0; i < data.length; i++) {
      const opportunity = data[i];
      const opportunityId = opportunity.opportunity_id;
      
      console.log(`  Processing opportunity ${i+1}/${data.length}: ${opportunity.opportunity_title}`);
      
      try {
        // Get detailed information to access summary fields
        const detailResponse = await axios.get(
          `https://api.simpler.grants.gov/v1/opportunities/${opportunityId}`,
          {
            headers: {
              'X-Auth': API_KEY
            }
          }
        );
        
        const fullOpportunity = detailResponse.data.data || detailResponse.data;
        
        // Extract just the fields you requested
        const extractedData = {
          // Top-level fields
          agency: fullOpportunity.agency,
          agency_code: fullOpportunity.agency_code,
          agency_name: fullOpportunity.agency_name,
          category: fullOpportunity.category,
          opportunity_id: fullOpportunity.opportunity_id,
          opportunity_status: fullOpportunity.opportunity_status,
          opportunity_title: fullOpportunity.opportunity_title,
          
          // Summary fields
          summary: {
            additional_info_url: fullOpportunity.summary?.additional_info_url || null,
            additional_info_url_description: fullOpportunity.summary?.additional_info_url_description || null,
            agency_email_address: fullOpportunity.summary?.agency_email_address || null,
            applicant_eligibility_description: fullOpportunity.summary?.applicant_eligibility_description || null,
            is_cost_sharing: fullOpportunity.summary?.is_cost_sharing || false,
            post_date: fullOpportunity.summary?.post_date || null,
            summary_description: fullOpportunity.summary?.summary_description || null
          }
        };
        
        // Add to our collection
        allOpportunities.push(extractedData);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`  Error fetching details for opportunity ${opportunityId}:`, error.message);
        // Continue with the next opportunity
      }
    }
    
    // Log pagination info if available
    if (pagination_info) {
      const totalPages = pagination_info.total_pages || 1;
      console.log(`Processed ${data.length} opportunities (Page ${pageToFetch}/${totalPages})`);
    }
    
  } catch (error) {
    console.error(`Error fetching page ${pageToFetch}:`, error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    return;
  }
  
  console.log(`\nTotal opportunities processed: ${allOpportunities.length}`);
  
  // Write the results to a JSON file
  fs.writeFileSync(
    OUTPUT_FILE, 
    JSON.stringify(allOpportunities, null, 2)
  );
  
  console.log(`Specific opportunity fields saved to ${OUTPUT_FILE}`);

  if (allOpportunities.length > 0) {
    console.log('\nDone');
  }
}

// Run the function
fetchSpecificFields();