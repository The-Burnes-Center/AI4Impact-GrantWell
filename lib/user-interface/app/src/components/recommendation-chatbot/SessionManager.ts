import { Auth } from 'aws-amplify';
import { v4 as uuidv4 } from 'uuid';

// Key for storing the recommendation chatbot session in localStorage
const RECOMMENDATION_SESSION_KEY = 'grantwell_recommendation_session';

export interface RecommendationSession {
  id: string;
  username: string;
  lastActive: number; // timestamp
  messages: any[]; // Store chat messages
}

/**
 * Session manager for the recommendation chatbot
 * Handles creating, retrieving, and updating a single session per user
 */
export class SessionManager {
  /**
   * Get the current session for the user or create a new one
   */
  static async getCurrentSession(): Promise<RecommendationSession> {
    try {
      // Get current username
      const user = await Auth.currentAuthenticatedUser();
      const username = user.username;
      
      // Check if a session exists
      const storedSession = localStorage.getItem(RECOMMENDATION_SESSION_KEY);
      
      if (storedSession) {
        const session = JSON.parse(storedSession) as RecommendationSession;
        
        // If session belongs to the current user, return it
        if (session.username === username) {
          // Update the 'lastActive' timestamp
          session.lastActive = Date.now();
          localStorage.setItem(RECOMMENDATION_SESSION_KEY, JSON.stringify(session));
          return session;
        }
      }
      
      // Create a new session if none exists or belongs to different user
      return this.createNewSession(username);
    } catch (error) {
      console.error('Error getting current session:', error);
      // Return an anonymous session for users who aren't logged in
      return this.createNewSession('anonymous');
    }
  }
  
  /**
   * Create a new session for the user, replacing any existing one
   */
  static async createNewSession(username: string): Promise<RecommendationSession> {
    const newSession: RecommendationSession = {
      id: uuidv4(),
      username,
      lastActive: Date.now(),
      messages: []
    };
    
    // Save to localStorage
    localStorage.setItem(RECOMMENDATION_SESSION_KEY, JSON.stringify(newSession));
    return newSession;
  }
  
  /**
   * Update the current session with new messages
   */
  static async updateSession(messages: any[]): Promise<RecommendationSession | null> {
    try {
      const session = await this.getCurrentSession();
      session.messages = messages;
      session.lastActive = Date.now();
      
      localStorage.setItem(RECOMMENDATION_SESSION_KEY, JSON.stringify(session));
      return session;
    } catch (error) {
      console.error('Error updating session:', error);
      return null;
    }
  }
  
  /**
   * Clear the current session
   */
  static clearSession(): void {
    localStorage.removeItem(RECOMMENDATION_SESSION_KEY);
  }
}