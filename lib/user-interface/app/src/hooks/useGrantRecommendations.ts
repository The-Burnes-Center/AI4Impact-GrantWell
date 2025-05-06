/**
 * useGrantRecommendations.ts
 * 
 * A React hook that provides grant recommendations based on user queries.
 * Connects to both WebSocket and REST API endpoints for grant recommendation functionality.
 */

import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Auth } from 'aws-amplify';
import awsExports from '../../../aws-exports.json';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [socketStatus, setSocketStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  /**
   * Gets grant recommendations using WebSocket API
   * Better for real-time interactions like chatbot
   */
  const getRecommendationsUsingWebSocket = useCallback(async (query: string, userPreferences = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get auth token for WebSocket connection
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      
      // Create WebSocket connection using the endpoint from aws-exports.json
      const websocketEndpoint = awsExports.wsEndpoint;
      const ws = new WebSocket(`${websocketEndpoint}?Authorization=${idToken}`);
      setSocket(ws);
      
      // Set up message handlers
      let collectedData: any = {};
      
      return new Promise<RecommendationResponse>((resolve, reject) => {
        ws.onopen = () => {
          setSocketStatus('connected');
          
          // Send recommendation request
          ws.send(JSON.stringify({
            action: 'getGrantRecommendations',
            data: {
              query,
              user_id: session.getIdToken().decodePayload().sub,
              session_id: uuidv4(),
              preferences: userPreferences
            }
          }));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'error') {
              reject(new Error(data.message || 'Error getting recommendations'));
              ws.close();
              return;
            }
            
            if (data.type === 'grant_recommendations') {
              collectedData = data;
            }
            
            if (data.type === 'end_stream') {
              // Complete the request
              const result = {
                grants: collectedData.grants || [],
                suggestedQuestions: collectedData.suggestedQuestions || []
              };
              
              setRecommendations(result);
              resolve(result);
              ws.close();
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onerror = (event) => {
          setError('WebSocket connection error');
          reject(new Error('WebSocket error'));
        };
        
        ws.onclose = () => {
          setSocketStatus('disconnected');
          setSocket(null);
        };
      }).finally(() => {
        setLoading(false);
      });
    } catch (error) {
      setError('Failed to get grant recommendations');
      setLoading(false);
      throw error;
    }
  }, []);
  
  /**
   * Gets grant recommendations using REST API
   * Better for one-time requests or when WebSocket isn't available
   */
  const getRecommendationsUsingREST = useCallback(async (query: string, userPreferences = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get auth token
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      
      // Make API request using the endpoint from aws-exports.json
      const restEndpoint = awsExports.httpEndpoint;
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
  }, []);
  
  return {
    loading,
    error,
    recommendations,
    socketStatus,
    getRecommendationsUsingWebSocket,
    getRecommendationsUsingREST
  };
};

export default useGrantRecommendations;