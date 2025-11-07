import { Utils } from "../utils";
import { AppConfig } from "../types";

export interface ChatSession {
  sessionId: string;
  userId: string;
  title: string;
  documentIdentifier: string;
  chatHistory: any[];
  lastModified?: string;
}

export class SessionsClient {
  private readonly API: string;

  constructor(config: AppConfig) {
    this.API = config.httpEndpoint.slice(0, -1);
  }

  // Creates a new chat session
  async createSession(session: ChatSession) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: 'add_session',
        session_id: session.sessionId,
        user_id: session.userId,
        title: session.title,
        document_identifier: session.documentIdentifier,
        chat_history: session.chatHistory || [],
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Gets a chat session
  async getSession(params: { sessionId: string; userId: string }): Promise<ChatSession | null> {
    const auth = await Utils.authenticate();
    let validData = false;
    let output;
    let runs = 0;
    const limit = 3;
    let errorMessage = "Could not load session";

    while (!validData && runs < limit) {
      runs += 1;
      const response = await fetch(this.API + '/user-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          operation: 'get_session',
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
      chatHistory: output.chat_history || [],
      lastModified: output.last_modified || new Date().toISOString(),
    };
  }

  // Updates a chat session
  async updateSession(session: ChatSession) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: 'update_session',
        session_id: session.sessionId,
        user_id: session.userId,
        title: session.title,
        document_identifier: session.documentIdentifier,
        chat_history: session.chatHistory || [],
        last_modified: new Date().toISOString(),
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Deletes a chat session
  async deleteSession(sessionId: string, userId: string) {
    try {
      const auth = await Utils.authenticate();
      const response = await fetch(this.API + '/user-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          operation: 'delete_session',
          session_id: sessionId,
          user_id: userId
        })
      });
    } catch {
      return "FAILED";
    }
    return "DONE";
  }

  // Lists all chat sessions
  async getSessions(userId: string, documentIdentifier?: string | null, all: boolean = false): Promise<any[]> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: all ? 'list_all_sessions_by_user_id' : 'list_sessions_by_user_id',
        user_id: userId,
        document_identifier: documentIdentifier || undefined
      })
    });

    if (response.status !== 200) {
      throw new Error('Failed to fetch sessions');
    }

    const data = await response.json();
    return data;
  }
}