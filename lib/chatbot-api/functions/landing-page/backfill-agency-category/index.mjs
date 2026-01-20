/**
 * Backfill Agency and Category Lambda Function
 * 
 * This script extracts agency and category from existing NOFOs
 * that don't have these fields set. It reads summary.json files,
 * uses LLM to extract the data, and updates DynamoDB.
 * 
 * This should be run manually via API Gateway or Lambda console.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const CLAUDE_MODEL_ID = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

/**
 * Valid grant categories - must match frontend expectations
 */
const VALID_CATEGORIES = [
  'Recovery Act',
  'Agriculture',
  'Arts',
  'Business and Commerce',
  'Community Development',
  'Consumer Protection',
  'Disaster Prevention and Relief',
  'Education',
  'Employment, Labor, and Training',
  'Energy',
  'Energy Infrastructure and Critical Mineral and Materials (EICMM)',
  'Environment',
  'Food and Nutrition',
  'Health',
  'Housing',
  'Humanities',
  'Information and Statistics',
  'Infrastructure Investment and Jobs Act',
  'Income Security and Social Services',
  'Law, Justice, and Legal Services',
  'Natural Resources',
  'Opportunity Zone Benefits',
  'Regional Development',
  'Science, Technology, and Other Research and Development',
  'Transportation',
  'Affordable Care Act',
  'Other'
];

/**
 * Funding category mapping from various formats to standard display format
 */
const FUNDING_CATEGORY_MAP = {
  'recovery_act': 'Recovery Act',
  'agriculture': 'Agriculture',
  'arts': 'Arts',
  'business_and_commerce': 'Business and Commerce',
  'community_development': 'Community Development',
  'consumer_protection': 'Consumer Protection',
  'disaster_prevention_and_relief': 'Disaster Prevention and Relief',
  'education': 'Education',
  'employment_labor_and_training': 'Employment, Labor, and Training',
  'energy': 'Energy',
  'energy_infrastructure_and_critical_mineral_and_materials_eicmm': 'Energy Infrastructure and Critical Mineral and Materials (EICMM)',
  'environment': 'Environment',
  'food_and_nutrition': 'Food and Nutrition',
  'health': 'Health',
  'housing': 'Housing',
  'humanities': 'Humanities',
  'information_and_statistics': 'Information and Statistics',
  'infrastructure_investment_and_jobs_act': 'Infrastructure Investment and Jobs Act',
  'income_security_and_social_services': 'Income Security and Social Services',
  'law_justice_and_legal_services': 'Law, Justice, and Legal Services',
  'natural_resources': 'Natural Resources',
  'opportunity_zone_benefits': 'Opportunity Zone Benefits',
  'regional_development': 'Regional Development',
  'science_technology_and_other_research_and_development': 'Science, Technology, and Other Research and Development',
  'transportation': 'Transportation',
  'affordable_care_act': 'Affordable Care Act',
};

/**
 * Map a category string to a valid category
 */
function mapToValidCategory(categoryStr) {
  if (!categoryStr) return 'Other';
  
  // Check if it's already a valid category
  if (VALID_CATEGORIES.includes(categoryStr)) {
    return categoryStr;
  }
  
  // Normalize: convert to lowercase and replace hyphens/spaces with underscores
  const normalized = categoryStr.toLowerCase().replace(/[-\s]/g, '_');
  
  // Direct match in FUNDING_CATEGORY_MAP
  if (FUNDING_CATEGORY_MAP[normalized]) {
    return FUNDING_CATEGORY_MAP[normalized];
  }
  
  // Try partial match
  for (const [key, value] of Object.entries(FUNDING_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  // Try case-insensitive match against VALID_CATEGORIES
  const lowerCategory = categoryStr.toLowerCase();
  for (const validCat of VALID_CATEGORIES) {
    if (validCat.toLowerCase() === lowerCategory) {
      return validCat;
    }
    // Partial match
    if (validCat.toLowerCase().includes(lowerCategory) || lowerCategory.includes(validCat.toLowerCase())) {
      return validCat;
    }
  }
  
  return 'Other';
}

// Convert a ReadableStream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Extract agency and category from grant summary using LLM
 */
async function extractAgencyAndCategory(summary, bedrockClient) {
  try {
    // Build context from summary
    const grantName = summary.GrantName || 'Unknown';
    const eligibility = (summary.EligibilityCriteria || [])
      .map(e => `${e.item}: ${e.description}`)
      .join('\n');
    const narrativeSections = (summary.ProjectNarrativeSections || [])
      .map(s => `${s.item}: ${s.description}`)
      .join('\n');
    
    const categoriesList = VALID_CATEGORIES.join('\n- ');

    const prompt = `# Agency and Category Extraction

## CONTEXT
You are analyzing a grant opportunity to extract the funding agency and category.

## GRANT INFORMATION
<grant_name>${grantName}</grant_name>

<eligibility_criteria>
${eligibility || 'Not available'}
</eligibility_criteria>

<project_sections>
${narrativeSections || 'Not available'}
</project_sections>

## TASK
1. **Agency**: Identify the government agency or organization that is offering this grant. Look for agency names in the grant title or eligibility criteria. Examples:
   - "Department of Health and Human Services"
   - "National Science Foundation"
   - "Department of Education"
   - "National Institutes of Health"
   - "Environmental Protection Agency"
   - If the agency cannot be determined, use "Unknown"

2. **Category**: Classify this grant into ONE of these categories based on its content and purpose:
- ${categoriesList}

## OUTPUT FORMAT
Return ONLY a JSON object with no additional text:
{
  "agency": "Agency Name",
  "category": "Category Name"
}`;

    const command = new InvokeModelCommand({
      modelId: CLAUDE_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });

    const response = await bedrockClient.send(command);
    const content = JSON.parse(
      new TextDecoder().decode(response.body)
    ).content[0].text.trim();

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      
      // Validate and normalize category
      const category = mapToValidCategory(result.category);
      const agency = result.agency || 'Unknown';
      
      return { agency, category };
    }
    
    return { agency: 'Unknown', category: 'Other' };
  } catch (error) {
    console.error('Error extracting agency and category:', error);
    return { agency: 'Unknown', category: 'Other' };
  }
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  
  const s3Client = new S3Client();
  const dynamoClient = new DynamoDBClient();
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

  const stats = {
    totalProcessed: 0,
    updated: 0,
    skippedAlreadyHas: 0,
    skippedNoSummary: 0,
    errors: 0,
    errorList: [],
    updatedGrants: [],
  };

  try {
    if (!tableName) {
      throw new Error('NOFO_METADATA_TABLE_NAME environment variable is not set');
    }

    console.log('Starting agency/category backfill...');

    // Get all folders in S3
    let allFolders = [];
    let continuationToken = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
        Delimiter: '/',
      });

      const result = await s3Client.send(command);
      
      if (result.CommonPrefixes && result.CommonPrefixes.length > 0) {
        allFolders = [...allFolders, ...result.CommonPrefixes.map(prefix => prefix.Prefix.slice(0, -1))];
      }
      
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`Found ${allFolders.length} NOFO folders to process`);

    // Process each folder
    for (const folderName of allFolders) {
      stats.totalProcessed++;

      try {
        // Check if grant already has agency and category in DynamoDB
        const getItemCommand = new GetItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: folderName }),
        });
        
        const existingItem = await dynamoClient.send(getItemCommand);
        
        if (existingItem.Item) {
          const item = unmarshall(existingItem.Item);
          const hasAgency = item.agency && item.agency !== 'Unknown';
          const hasCategory = item.category && item.category !== 'Other';
          
          if (hasAgency && hasCategory) {
            stats.skippedAlreadyHas++;
            console.log(`Skipping ${folderName}: Already has agency (${item.agency}) and category (${item.category})`);
            continue;
          }
        }

        // Read summary.json
        const summaryKey = `${folderName}/summary.json`;
        let summary;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: summaryKey,
          });
          
          const result = await s3Client.send(getCommand);
          const fileContent = await streamToString(result.Body);
          summary = JSON.parse(fileContent);
        } catch (error) {
          if (error.name === 'NoSuchKey') {
            stats.skippedNoSummary++;
            console.log(`Skipping ${folderName}: No summary.json`);
            continue;
          }
          throw error;
        }

        // Extract agency and category using LLM
        console.log(`Extracting agency/category for ${folderName}...`);
        const { agency, category } = await extractAgencyAndCategory(summary, bedrockClient);

        console.log(`Found for ${folderName}: Agency="${agency}", Category="${category}"`);

        // Update DynamoDB
        const now = new Date().toISOString();
        const updateCommand = new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: folderName }),
          UpdateExpression: 'SET agency = :agency, category = :category, #updated_at = :updated_at',
          ExpressionAttributeNames: {
            '#updated_at': 'updated_at',
          },
          ExpressionAttributeValues: marshall({
            ':agency': agency,
            ':category': category,
            ':updated_at': now,
          }),
        });

        await dynamoClient.send(updateCommand);
        stats.updated++;
        stats.updatedGrants.push({ name: folderName, agency, category });
        console.log(`Updated ${folderName}`);

        // Rate limiting - wait 500ms between LLM requests to avoid throttling
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        stats.errors++;
        stats.errorList.push({
          folder: folderName,
          error: error.message,
        });
        console.error(`Error processing ${folderName}:`, error);
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
        stats: {
          totalProcessed: stats.totalProcessed,
          updated: stats.updated,
          skippedAlreadyHas: stats.skippedAlreadyHas,
          skippedNoSummary: stats.skippedNoSummary,
          errors: stats.errors,
        },
        updatedGrants: stats.updatedGrants.slice(0, 50), // Limit output size
        errorList: stats.errorList.slice(0, 20),
      }),
    };

  } catch (error) {
    console.error('Error during backfill:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Failed to backfill agency and category',
        error: error.message,
        stats,
      }),
    };
  }
};
