import { Utils } from "../utils";
import { AppConfig } from "../types";

export interface DocumentDraft {
  sessionId: string;
  userId: string;
  title: string;
  documentIdentifier: string;
  sections?: Record<string, any>;
  projectBasics?: any;
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
    let limit = 3;
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
      lastModified: output.last_modified || new Date().toISOString(),
    };
  }

  // Updates a document draft
  async updateDraft(draft: DocumentDraft) {
    const auth = await Utils.authenticate();
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
        last_modified: new Date().toISOString(),
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
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
    } catch {
      return "FAILED";
    }
    return "DONE";
  }

  // Lists all document drafts
  async getDrafts(userId: string, documentIdentifier?: string | null, all: boolean = false): Promise<any[]> {
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

    if (response.status !== 200) {
      throw new Error('Failed to fetch drafts');
    }

    const data = await response.json();
    return data;
  }
} 