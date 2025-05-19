// fetch_titles.js - Simple script to fetch opportunity titles and save to JSON

const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Configuration
const API_KEY = process.env.GRANTS_GOV_API_KEY || 'TPAa2rjjBgE6qs6linD5';
const OUTPUT_FILE = 'opportunity_titles.json';
const PAGE_SIZE = 25; // Number of opportunities per page

// Function to fetch opportunities with pagination
async function fetchOpportunityTitles() {
  console.log('Fetching opportunity titles from Grants.gov API...');
  
  let allOpportunities = [];
  let currentPage = 1;
  let totalPages = 1;
  
  // Loop through pages until we've fetched all opportunities
  while (currentPage <= totalPages) {
    console.log(`Fetching page ${currentPage}...`);
    
    try {
      // Make the API request with the correct format
      const response = await axios.post(
        'https://api.simpler.grants.gov/v1/opportunities/search',
        {
          pagination: {
            page_offset: currentPage,
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
        break;
      }
      
      // Extract the data and pagination info
      const { data, pagination_info } = response.data;
      
      if (!data || !Array.isArray(data)) {
        console.error('Error: Unexpected response format');
        break;
      }
      
      // Extract opportunity information
      const opportunities = data.map(opp => ({
        id: opp.opportunity_id,
        title: opp.opportunity_title || 'Untitled',
        agency: opp.agency_name,
        status: opp.opportunity_status
      }));
      
      // Add to our collection
      allOpportunities = [...allOpportunities, ...opportunities];
      
      // Update pagination info
      if (pagination_info) {
        totalPages = pagination_info.total_pages || 1;
        console.log(`Retrieved ${opportunities.length} opportunities (Page ${currentPage}/${totalPages})`);
      }
      
      // Move to the next page
      currentPage++;
      
      // Optional: Add a small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error fetching page ${currentPage}:`, error.message);
      if (error.response) {
        console.error('Error details:', error.response.data);
      }
      break;
    }
  }
  
  console.log(`Total opportunities retrieved: ${allOpportunities.length}`);
  
  // Write the results to a JSON file
  fs.writeFileSync(
    OUTPUT_FILE, 
    JSON.stringify(allOpportunities, null, 2)
  );
  
  console.log(`Opportunity titles saved to ${OUTPUT_FILE}`);
  
  // Print a sample of the opportunities
  console.log('\nSample of opportunities:');
  allOpportunities.slice(0, 5).forEach((opp, index) => {
    console.log(`${index + 1}. ${opp.title} (ID: ${opp.id}, Agency: ${opp.agency})`);
  });
}

// Run the function
fetchOpportunityTitles();