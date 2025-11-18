import { Utils } from "../utils";
import { AppConfig } from "../types";

export interface DocumentDraft {
  sessionId: string;
  userId: string;
  title: string;
  documentIdentifier: string;
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
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Gets a document draft
  async getDraft(params: { sessionId: string; userId: string }): Promise<DocumentDraft | null> {
    const auth = await Utils.authenticate();
    let validData = false;
    let output;
    let runs = 0;
    const limit = 3;
    let errorMessage = "Could not load draft";

    while (!validData && runs < limit) {
      runs += 1;
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

      if (response.status != 200) {
        validData = false;
        errorMessage = await response.json();
        break;
      }
      
      try {
        output = await response.json();
        validData = true;
      } catch (e) {
        console.log(e);
      }
    }

    if (!validData) {
      throw new Error(errorMessage);
    }

    if (!output) {
      return null;
    }

    return {
      sessionId: params.sessionId,
      userId: params.userId,
      title: output.title || '',
      documentIdentifier: output.document_identifier || '',
      sections: output.sections || {},
      projectBasics: output.project_basics || {},
      questionnaire: output.questionnaire || {},
      lastModified: output.last_modified || new Date().toISOString(),
    };
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
  async generateDraft(params: {
    query: string;
    documentIdentifier: string;
    projectBasics?: any;
    questionnaire?: any;
    sessionId: string;
  }): Promise<Record<string, any>> {
    const auth = await Utils.authenticate();
    console.log('Calling /draft-generation with:', params);
    const response = await fetch(this.API + '/draft-generation', {
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

    console.log('Draft generation response status:', response.status);
    if (response.status !== 200) {
      const errorMessage = await response.json();
      console.error('Draft generation error:', errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Draft generation response data:', data);
    return data.sections || {};
  }
} 