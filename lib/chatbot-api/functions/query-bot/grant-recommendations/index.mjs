/**
 * This Lambda function analyzes NOFO summaries and recommends similar grants based on eligibility criteria.
 * It compares the provided NOFO with others in the bucket and returns a list of recommendations.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client();
const BUCKET_NAME = process.env.BUCKET;

/**
 * Extracts key terms from eligibility criteria and narrative sections.
 * 
 * @param {object} summary - The parsed summary JSON object.
 * @returns {string[]} - Array of key terms extracted from the summary.
 */
function extractKeyTerms(summary) {
  const terms = new Set();
  
  // Extract terms from eligibility criteria
  if (summary.EligibilityCriteria && Array.isArray(summary.EligibilityCriteria)) {
    summary.EligibilityCriteria.forEach(criterion => {
      // Extract key terms from item and description
      const itemTerms = extractTermsFromText(criterion.item);
      const descriptionTerms = extractTermsFromText(criterion.description);
      
      itemTerms.forEach(term => terms.add(term));
      descriptionTerms.forEach(term => terms.add(term));
    });
  }
  
  // Extract terms from project narrative sections
  if (summary.ProjectNarrativeSections && Array.isArray(summary.ProjectNarrativeSections)) {
    summary.ProjectNarrativeSections.forEach(section => {
      const itemTerms = extractTermsFromText(section.item);
      const descriptionTerms = extractTermsFromText(section.description);
      
      itemTerms.forEach(term => terms.add(term));
      descriptionTerms.forEach(term => terms.add(term));
    });
  }
  
  return Array.from(terms);
}

/**
 * Extracts meaningful terms from text by removing common words.
 * 
 * @param {string} text - The input text.
 * @returns {string[]} - Array of extracted terms.
 */
function extractTermsFromText(text) {
  if (!text) return [];
  
  // Convert to lowercase and remove punctuation
  const cleanedText = text.toLowerCase().replace(/[^\w\s]/g, '');
  
  // Split into words
  const words = cleanedText.split(/\s+/);
  
  // Common stopwords to filter out
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
    'which', 'this', 'that', 'these', 'those', 'then', 'just', 'so', 'than',
    'such', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'too', 'very', 'can', 'will', 'should', 'now',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
    'into', 'over', 'after', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'must', 
    'shall', 'may', 'might', 'would', 'could', 'should'
  ]);
  
  // Filter out stopwords and short terms
  return words.filter(word => word.length > 3 && !stopwords.has(word));
}

/**
 * Calculates similarity score between two sets of terms.
 * 
 * @param {string[]} terms1 - First set of terms.
 * @param {string[]} terms2 - Second set of terms.
 * @returns {number} - Similarity score between 0 and 1.
 */
function calculateSimilarity(terms1, terms2) {
  if (!terms1.length || !terms2.length) return 0;
  
  const set1 = new Set(terms1);
  const set2 = new Set(terms2);
  
  // Find intersection
  const intersection = new Set();
  for (const term of set1) {
    if (set2.has(term)) {
      intersection.add(term);
    }
  }
  
  // Jaccard similarity: size of intersection divided by size of union
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Retrieves a list of all NOFOs with summaries from the S3 bucket.
 * 
 * @returns {Promise<string[]>} - Array of NOFO folder paths.
 */
async function listAllNofos() {
  try {
    let allNofos = [];
    let continuationToken = undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      });
      
      const result = await s3Client.send(command);
      
      // Filter for summary.json files
      const summaryObjects = result.Contents?.filter(
        item => item.Key.endsWith('summary.json')
      ) || [];
      
      // Extract folder paths
      summaryObjects.forEach(item => {
        const folderPath = item.Key.substring(0, item.Key.lastIndexOf('/'));
        allNofos.push(folderPath);
      });
      
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    
    return [...new Set(allNofos)]; // Remove duplicates
  } catch (error) {
    console.error("Error listing NOFOs:", error);
    return [];
  }
}

/**
 * Retrieves and parses a summary.json file from S3.
 * 
 * @param {string} nofoPath - The NOFO folder path.
 * @returns {Promise<object|null>} - Parsed summary object or null if error.
 */
async function getNOFOSummary(nofoPath) {
  try {
    const summaryKey = `${nofoPath}/summary.json`;
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: summaryKey,
    });
    
    const response = await s3Client.send(command);
    const stringContent = await streamToString(response.Body);
    
    return JSON.parse(stringContent);
  } catch (error) {
    console.error(`Error retrieving summary for ${nofoPath}:`, error);
    return null;
  }
}

/**
 * Converts a readable stream to a string.
 * 
 * @param {ReadableStream} stream - The stream to convert.
 * @returns {Promise<string>} - The stream content as a string.
 */
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Main Lambda handler function.
 * 
 * @param {object} event - The Lambda event object.
 * @returns {object} - Response with recommended grants.
 */
export const handler = async (event) => {
  try {
    const requestBody = JSON.parse(event.body || '{}');
    const nofoId = requestBody.nofoId;
    
    if (!nofoId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'Missing nofoId parameter',
        }),
      };
    }
    
    // Get all NOFOs with summaries
    const allNofos = await listAllNofos();
    
    // Get the target NOFO summary
    const targetSummary = await getNOFOSummary(nofoId);
    if (!targetSummary) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'NOFO summary not found',
        }),
      };
    }
    
    // Extract key terms from target NOFO
    const targetTerms = extractKeyTerms(targetSummary);
    
    // Compare with other NOFOs
    const recommendations = [];
    
    for (const nofoPath of allNofos) {
      // Skip the target NOFO
      if (nofoPath === nofoId) continue;
      
      // Get and analyze the comparison NOFO
      const compareSummary = await getNOFOSummary(nofoPath);
      if (!compareSummary) continue;
      
      const compareTerms = extractKeyTerms(compareSummary);
      const similarity = calculateSimilarity(targetTerms, compareTerms);
      
      // Only include if similarity is above threshold
      if (similarity > 0.15) {
        // Find matching terms
        const matchingTerms = targetTerms.filter(term => compareTerms.includes(term));
        
        recommendations.push({
          id: nofoPath,
          name: compareSummary.GrantName || 'Unnamed Grant',
          similarity: similarity.toFixed(2),
          matchingCriteria: matchingTerms.slice(0, 5) // Limit to top 5 matching criteria
        });
      }
    }
    
    // Sort by similarity (highest first)
    recommendations.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));
    
    // Return top 5 recommendations
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        targetNofo: {
          id: nofoId,
          name: targetSummary.GrantName || 'Current Grant',
        },
        recommendations: recommendations.slice(0, 5),
      }),
    };
  } catch (error) {
    console.error('Error generating recommendations:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error generating recommendations',
        error: error.message,
      }),
    };
  }
};