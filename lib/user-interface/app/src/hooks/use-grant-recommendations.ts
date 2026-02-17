/**
 * useGrantRecommendations.ts
 * 
 * A React hook that provides grant recommendations based on user queries.
 * Uses REST API endpoint for grant recommendation functionality.
 * 
 * Supports async pattern:
 * - Returns filtered grants (category/agency) immediately
 * - Polls for RAG results in background
 */

import { useCallback, useState, useContext, useRef } from 'react';
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
  source?: 'db_filter' | 'rag'; // Track source for UI differentiation
  grantType?: 'federal' | 'state' | 'quasi' | 'philanthropic' | 'unknown'; // Grant type
}

export interface RecommendationResponse {
  grants: GrantRecommendation[];
  suggestedQuestions: string[];
  jobId?: string;
  ragStatus?: 'pending' | 'in_progress' | 'completed' | 'error';
  filteredCount?: number;
  ragCount?: number;
  filters?: {
    category?: string;
    agency?: string;
  };
  searchMethod?: string;
  toolUsed?: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'partial' | 'in_progress' | 'completed' | 'error';
  ragStatus: 'pending' | 'in_progress' | 'completed' | 'error';
  filteredGrants: GrantRecommendation[];
  ragGrants: GrantRecommendation[];
  allGrants?: GrantRecommendation[]; // Complete deduplicated results (preferred)
  filters?: {
    category?: string;
    agency?: string;
  };
  error?: string;
}

/**
 * React hook for getting grant recommendations
 */
export const useGrantRecommendations = () => {
  const appContext = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [loadingRAG, setLoadingRAG] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Stop polling for job status
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  /**
   * Poll for job status to get RAG results
   */
  const pollJobStatus = useCallback(async (jobId: string, onUpdate: (data: JobStatusResponse) => void) => {
    if (!appContext) return;
    
    const session = await Auth.currentSession();
    const idToken = session.getIdToken().getJwtToken();
    const restEndpoint = appContext.httpEndpoint;
    const endpoint = restEndpoint.endsWith('/') ? restEndpoint : `${restEndpoint}/`;
    
    let pollCount = 0;
    const maxPolls = 30; // Max 30 polls (about 1 minute with 2s interval)
    
    const poll = async () => {
      try {
        pollCount++;
        console.log(`[Polling] Checking job ${jobId} status (attempt ${pollCount}/${maxPolls})`);
        
        const response = await fetch(`${endpoint}search-jobs/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          console.warn(`[Polling] Job status check failed: ${response.status}`);
          return;
        }
        
        const data: JobStatusResponse = await response.json();
        console.log(`[Polling] Job ${jobId} status: ${data.status}, ragStatus: ${data.ragStatus}`);
        
        onUpdate(data);
        
        // Stop polling if completed or error
        if (data.ragStatus === 'completed' || data.ragStatus === 'error' || pollCount >= maxPolls) {
          stopPolling();
          setLoadingRAG(false);
        }
      } catch (err) {
        console.error('[Polling] Error checking job status:', err);
      }
    };
    
    // Start polling every 2 seconds
    pollingIntervalRef.current = setInterval(poll, 2000);
    
    // Also poll immediately
    await poll();
  }, [appContext, stopPolling]);

  /**
   * Gets grant recommendations using REST API
   * Returns filtered grants immediately, then polls for RAG results
   */
  const getRecommendationsUsingREST = useCallback(async (query: string, userPreferences = {}) => {
    try {
      if (!appContext) {
        throw new Error('Application context not available');
      }
      
      // Stop any existing polling
      stopPolling();
      
      setLoading(true);
      setLoadingRAG(false);
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
      
      const data: RecommendationResponse = await response.json();
      console.log(`[Search] Received response: ${data.grants?.length || 0} grants, ragStatus: ${data.ragStatus}`);
      
      setRecommendations(data);
      setLoading(false);
      
      // If RAG is still pending/in_progress and we have a jobId, start polling
      if (data.jobId && data.ragStatus && data.ragStatus !== 'completed') {
        console.log(`[Search] Starting polling for job ${data.jobId}`);
        setLoadingRAG(true);
        
        await pollJobStatus(data.jobId, (jobData) => {
          // Use complete deduplicated results if available, otherwise merge manually
          if (jobData.allGrants && jobData.allGrants.length > 0) {
            // Use the complete deduplicated results from backend
            console.log(`[Polling] Received ${jobData.allGrants.length} complete deduplicated grants`);
            setRecommendations(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                grants: jobData.allGrants!,
                ragStatus: jobData.ragStatus,
                ragCount: jobData.ragGrants?.length || 0
              };
            });
          } else if (jobData.ragGrants && jobData.ragGrants.length > 0) {
            // Fallback: merge manually if allGrants not available
            setRecommendations(prev => {
              if (!prev) return prev;
              
              // Combine filtered grants with RAG grants, avoiding duplicates
              const existingIds = new Set(prev.grants.map(g => g.id));
              const newRagGrants = jobData.ragGrants.filter(g => !existingIds.has(g.id));
              
              console.log(`[Polling] Adding ${newRagGrants.length} new RAG grants (manual merge)`);
              
              return {
                ...prev,
                grants: [...prev.grants, ...newRagGrants],
                ragStatus: jobData.ragStatus,
                ragCount: jobData.ragGrants.length
              };
            });
          }
        });
      }
      
      return data;
    } catch (error) {
      setError('Failed to get grant recommendations');
      setLoading(false);
      setLoadingRAG(false);
      throw error;
    }
  }, [appContext, pollJobStatus, stopPolling]);
  
  return {
    loading,
    loadingRAG,
    error,
    recommendations,
    getRecommendationsUsingREST,
    stopPolling
  };
};

export default useGrantRecommendations;