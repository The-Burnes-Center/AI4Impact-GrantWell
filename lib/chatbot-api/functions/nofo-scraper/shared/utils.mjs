/**
 * Shared utilities for the NOFO scraper fan-out architecture.
 * Used by both the Coordinator and Opportunity Processor Lambdas.
 */

export const RATE_LIMIT_DELAY = 250;
export const OPPORTUNITIES_PER_PAGE = 25;
export const CLAUDE_MODEL_ID = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

export const FUNDING_CATEGORY_MAP = {
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

/** Normalize NOFO folder name: slashes → dashes so S3 path matches DynamoDB nofo_name */
export function normalizeNofoFolderName(name) {
  return (name || '').replace(/\//g, '-');
}

/**
 * Normalize date to YYYY-MM-DD format.
 * Supports both YYYY-MM-DD format and ISO date strings.
 */
export function normalizeDateToYYYYMMDD(dateString) {
  if (!dateString) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }

    const hasESTOffset = dateString.includes('-05:00') || dateString.includes('-04:00');

    if (hasESTOffset) {
      const estDateString = date.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [month, day, year] = estDateString.split('/');
      return `${year}-${month}-${day}`;
    } else {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    console.warn(`Failed to normalize date: ${dateString}`, error);
    return null;
  }
}

/**
 * Map API funding category to display category.
 * Returns null if category cannot be mapped (category is mandatory).
 */
export function mapFundingCategory(apiCategory) {
  if (!apiCategory) return null;

  const normalized = apiCategory.toLowerCase().replace(/-/g, '_');

  if (FUNDING_CATEGORY_MAP[normalized]) {
    return FUNDING_CATEGORY_MAP[normalized];
  }

  for (const [key, value] of Object.entries(FUNDING_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a page of opportunity IDs from Simpler.Grants.gov search API.
 */
export async function fetchOpportunityIDs(apiKey, pageNumber = 1) {
  const requestBody = {
    filters: {
      opportunity_status: { one_of: ['posted'] },
      funding_instrument: { one_of: ['grant', 'cooperative_agreement'] },
    },
    pagination: {
      page_offset: pageNumber,
      page_size: OPPORTUNITIES_PER_PAGE,
      sort_order: [{ order_by: 'opportunity_id', sort_direction: 'descending' }],
    },
  };

  const response = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data?.data || [];
}
