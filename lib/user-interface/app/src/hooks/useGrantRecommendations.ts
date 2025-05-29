/**
 * useGrantRecommendations.ts
 * 
 * A React hook that provides grant recommendations based on user queries.
 * Uses REST API endpoint for grant recommendation functionality.
 */

import { useCallback, useState, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Auth } from 'aws-amplify';
import { AppContext } from '../common/app-context';

// Types for grant recommendations
export interface GrantRecommendation {
  id: string;
  name: string;
  matchScore: number;
  matchReason: string;
  eligibilityMatch: boolean;
  fundingAmount: string;
  deadline: string;
  keyRequirements: string[];
  summaryUrl: string;
}

export interface RecommendationResponse {
  grants: GrantRecommendation[];
  suggestedQuestions: string[];
}

/**
 * React hook for getting grant recommendations
 */
export const useGrantRecommendations = () => {
  const appContext = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);

  /**
   * Gets grant recommendations using REST API
   */
  const getRecommendationsUsingREST = useCallback(async (query: string, userPreferences = {}) => {
    try {
      if (!appContext) {
        throw new Error('Application context not available');
      }
      
      setLoading(true);
      setError(null);
      
      // Get auth token
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      
      // Make API request using the endpoint from app context
      const restEndpoint = appContext.httpEndpoint;
      // Ensure endpoint ends with slash for proper URL construction
      const endpoint = restEndpoint.endsWith('/') ? restEndpoint : `${restEndpoint}/`;
      const response = await fetch(`${endpoint}grant-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          query,
          userId: session.getIdToken().decodePayload().sub,
          sessionId: uuidv4(),
          preferences: userPreferences
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setRecommendations(data);
      return data;
    } catch (error) {
      setError('Failed to get grant recommendations');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [appContext]);
  
  return {
    loading,
    error,
    recommendations,
    getRecommendationsUsingREST
  };
};

export default useGrantRecommendations;