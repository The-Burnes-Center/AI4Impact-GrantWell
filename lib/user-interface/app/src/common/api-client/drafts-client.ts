import { Utils } from "../utils";
import { AppConfig } from "../types";

export type DraftStatus = 'nofo_selected' | 'in_progress' | 'draft_generated' | 'review_ready' | 'submitted';

export interface DocumentDraft {
  sessionId: string;
  userId: string;
  title: string;
  documentIdentifier: string;
  status?: DraftStatus;
  sections?: Record<string, any>;
  projectBasics?: any;
  questionnaire?: any;
  additionalInfo?: string;
  uploadedFiles?: Array<{
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
  lastModified?: string;
}

export class DraftsClient {
  private readonly API: string;

  constructor(config: AppConfig) {
    // Ensure the endpoint ends with a slash
    this.API = config.httpEndpoint.endsWith('/') ? config.httpEndpoint.slice(0, -1) : config.httpEndpoint;
  }

  // Creates a new document draft
  async createDraft(draft: DocumentDraft) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: 'add_draft',
        session_id: draft.sessionId,
        user_id: draft.userId,
        title: draft.title,
        document_identifier: draft.documentIdentifier,
        sections: draft.sections || {},
        status: draft.status,
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Gets a document draft
  // If draft doesn't exist, waits for draft generation to complete (if in progress)
  async getDraft(params: { 
    sessionId: string; 
    userId: string;
    onProgress?: (message: string, attempt: number, maxAttempts: number) => void;
  }): Promise<DocumentDraft | null> {
    const auth = await Utils.authenticate();
    let output;
    let pollCount = 0;
    const maxPolls = 60; // Max 60 polls (2 minutes with 2s interval) - same as draft generation timeout
    const pollInterval = 2000; // 2 seconds

    while (pollCount < maxPolls) {
      pollCount++;
      
      const response = await fetch(this.API + '/user-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          operation: 'get_draft',
          session_id: params.sessionId,
          user_id: params.userId
        }),
      });

      // If 404, draft doesn't exist yet - wait and retry (might be generating)
      if (response.status === 404) {
        console.log(`[getDraft] Draft not found for sessionId ${params.sessionId}, waiting... (attempt ${pollCount}/${maxPolls})`);
        
        // Notify progress callback
        if (params.onProgress) {
          if (pollCount === 1) {
            params.onProgress('Waiting for draft generation to complete...', pollCount, maxPolls);
          } else if (pollCount <= 15) {
            params.onProgress('Draft generation in progress...', pollCount, maxPolls);
          } else if (pollCount <= 30) {
            params.onProgress('Draft generation is taking longer than expected...', pollCount, maxPolls);
          } else {
            params.onProgress('Still waiting for draft generation...', pollCount, maxPolls);
          }
        }
        
        // Wait before retrying (unless this is the last attempt)
        if (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        } else {
          // After max polls, draft still doesn't exist
          if (params.onProgress) {
            params.onProgress('Draft generation timed out', pollCount, maxPolls);
          }
          return null;
        }
      }

      // For other errors, log and retry
      if (response.status !== 200) {
        try {
          const errorData = await response.json();
          console.warn(`[getDraft] Error fetching draft (attempt ${pollCount}):`, errorData);
        } catch (e) {
          console.warn(`[getDraft] Error parsing error response (attempt ${pollCount}):`, e);
        }
        
        // Notify progress callback about retry
        if (params.onProgress && pollCount < maxPolls) {
          params.onProgress('Retrying...', pollCount, maxPolls);
        }
        
        // Wait and retry for non-404 errors
        if (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        } else {
          // After max retries, return null
          return null;
        }
      }
      
      // Success - parse and return draft
      try {
        output = await response.json();
        // Check if response body contains an error message
        if (typeof output === 'string' && output.includes('No record found')) {
          // Notify progress callback
          if (params.onProgress && pollCount < maxPolls) {
            params.onProgress('Waiting for draft...', pollCount, maxPolls);
          }
          // Wait and retry
          if (pollCount < maxPolls) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          } else {
            return null;
          }
        }
        
        // Draft found!
        console.log(`[getDraft] Draft found for sessionId ${params.sessionId} after ${pollCount} attempts`);
        if (params.onProgress && pollCount > 1) {
          params.onProgress('Draft loaded successfully!', pollCount, maxPolls);
        }
        return {
          sessionId: params.sessionId,
          userId: params.userId,
          title: output.title || '',
          documentIdentifier: output.document_identifier || '',
          status: output.status || 'nofo_selected',
          sections: output.sections || {},
          projectBasics: output.project_basics || {},
          questionnaire: output.questionnaire || {},
          lastModified: output.last_modified || new Date().toISOString(),
        };
      } catch (e) {
        console.log(`[getDraft] Error parsing response (attempt ${pollCount}):`, e);
        // Wait and retry
        if (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
      }
    }

    // If we've exhausted all polls, draft doesn't exist
    console.log(`[getDraft] Draft not found after ${maxPolls} attempts for sessionId ${params.sessionId}`);
    return null;
  }

  // Updates a document draft
  async updateDraft(draft: DocumentDraft) {
    const auth = await Utils.authenticate();
    console.log('Updating draft with:', draft);
    const response = await fetch(this.API + '/user-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: 'update_draft',
        session_id: draft.sessionId,
        user_id: draft.userId,
        title: draft.title,
        document_identifier: draft.documentIdentifier,
        sections: draft.sections || {},
        project_basics: draft.projectBasics || {},
        questionnaire: draft.questionnaire || {},
        last_modified: draft.lastModified || new Date().toISOString(),
        status: draft.status,
        additionalInfo: draft.additionalInfo,
        uploadedFiles: draft.uploadedFiles
      }),
    });

    console.log('Update draft response status:', response.status);
    if (response.status !== 200) {
      const errorMessage = await response.json();
      console.error('Update draft error:', errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Update draft response data:', data);
    return data;
  }

  // Deletes a document draft
  async deleteDraft(sessionId: string, userId: string) {
    try {
      const auth = await Utils.authenticate();
      const response = await fetch(this.API + '/user-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          operation: 'delete_draft',
          session_id: sessionId,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Response was not JSON");
      }

      const data = await response.json();
      
      if (!data.deleted) {
        throw new Error(data.message || 'Failed to delete draft');
      }

      return data;
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }

  // Lists all document drafts
  async getDrafts(userId: string, documentIdentifier?: string | null, all: boolean = false): Promise<DocumentDraft[]> {
    try {
      const auth = await Utils.authenticate();
      const response = await fetch(this.API + '/user-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          operation: all ? 'list_all_drafts_by_user_id' : 'list_drafts_by_user_id',
          user_id: userId,
          document_identifier: documentIdentifier || undefined
        })
      });

      const data = await response.json();
      
      if (response.status !== 200) {
        const errorMessage = data.error || data.body || 'Unknown error';
        console.error('Draft API Error:', {
          status: response.status,
          data: data
        });
        throw new Error(`Failed to fetch drafts: ${errorMessage}`);
      }

      // If data is an array directly, use it
      if (Array.isArray(data)) {
        return data.map((draft: any) => ({
          sessionId: draft.sessionId,
          userId: userId,
          title: draft.title,
          documentIdentifier: draft.documentIdentifier,
          status: draft.status || 'nofo_selected',
          lastModified: draft.lastModified
        }));
      }

      // If data has a body property
      if (data.body) {
        const drafts = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
        
        if (!Array.isArray(drafts)) {
          console.error('Invalid drafts format:', drafts);
          throw new Error('Invalid response format: body is not an array');
        }
        
        return drafts.map((draft: any) => ({
          sessionId: draft.sessionId,
          userId: userId,
          title: draft.title,
          documentIdentifier: draft.documentIdentifier,
          status: draft.status || 'nofo_selected',
          lastModified: draft.lastModified
        }));
      }

      // If we get here, we don't have a valid response format
      throw new Error('Invalid response format: missing body');
    } catch (error) {
      console.error('Error in getDrafts:', error);
      throw error;
    }
  }

  // Generates draft sections based on project basics and questionnaire
  // Uses async polling pattern to handle long-running operations
  async generateDraft(params: {
    query: string;
    documentIdentifier: string;
    projectBasics?: any;
    questionnaire?: any;
    sessionId: string;
    onProgress?: (status: string) => void;
  }): Promise<Record<string, any>> {
    const auth = await Utils.authenticate();
    console.log('Calling /draft-generation with:', params);
    
    // Start the draft generation job
    const startResponse = await fetch(this.API + '/draft-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        query: params.query,
        documentIdentifier: params.documentIdentifier,
        projectBasics: params.projectBasics || {},
        questionnaire: params.questionnaire || {},
        sessionId: params.sessionId
      }),
    });

    console.log('Draft generation start response status:', startResponse.status);
    if (startResponse.status !== 200) {
      const errorMessage = await startResponse.json();
      console.error('Draft generation error:', errorMessage);
      throw new Error(errorMessage.error || 'Failed to start draft generation');
    }

    const startData = await startResponse.json();
    const jobId = startData.jobId;
    console.log('Draft generation job started:', jobId);
    
    if (params.onProgress) {
      params.onProgress('in_progress');
    }

    // Poll for job status
    let pollCount = 0;
    const maxPolls = 60; // Max 60 polls (about 2 minutes with 2s interval)
    const pollInterval = 2000; // 2 seconds
    
    while (pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
      
      console.log(`[Polling] Checking draft generation job ${jobId} status (attempt ${pollCount}/${maxPolls})`);
      
      try {
        const statusResponse = await fetch(this.API + `/draft-generation-jobs/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + auth,
          },
        });
        
        if (!statusResponse.ok) {
          console.warn(`[Polling] Job status check failed: ${statusResponse.status}`);
          continue;
        }
        
        const statusData = await statusResponse.json();
        console.log(`[Polling] Job ${jobId} status: ${statusData.status}`);
        
        if (statusData.status === 'completed') {
          console.log('Draft generation completed:', statusData.sections);
          return statusData.sections || {};
        } else if (statusData.status === 'error') {
          throw new Error(statusData.error || 'Draft generation failed');
        }
        
        // Continue polling if still in progress
      } catch (err) {
        console.error('[Polling] Error checking job status:', err);
        // Continue polling on error
      }
    }
    
    // If we've exhausted polls, throw an error
    throw new Error('Draft generation timed out. Please try again.');
  }

  // Generates a tagged PDF from draft data
  async generatePDF(draftData: {
    title?: string;
    grantName?: string;
    projectBasics?: any;
    sections?: Record<string, string>;
  }): Promise<Blob> {
    const auth = await Utils.authenticate();
    console.log('Calling /generate-pdf with:', draftData);
    
    const response = await fetch(this.API + '/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        draftData: {
          title: draftData.title || 'Grant Application',
          grantName: draftData.grantName,
          projectBasics: draftData.projectBasics || {},
          sections: draftData.sections || {},
        },
      }),
    });

    console.log('PDF generation response status:', response.status);
    console.log('PDF generation response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.status !== 200) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || 'Failed to generate PDF';
      } catch (e) {
        // If response is not JSON, try to get text
        const errorText = await response.text();
        errorMessage = errorText || `Failed to generate PDF: HTTP ${response.status}`;
      }
      console.error('PDF generation error:', errorMessage);
      throw new Error(errorMessage);
    }

    // The response is a PDF blob
    // API Gateway HTTP API will decode the base64 body automatically
    const blob = await response.blob();
    console.log('PDF blob created, size:', blob.size, 'bytes');
    return blob;
  }
} 