/**
 * Shared document types used across the document editor flow,
 * draft API clients, and related components.
 */

export interface ProjectBasicsData {
  projectName?: string;
  organizationName?: string;
  requestedAmount?: string;
  location?: string;
  zipCode?: string;
  contactName?: string;
  contactEmail?: string;
}

export interface DocumentData {
  id: string;
  nofoId: string;
  sections: Record<string, string>;
  projectBasics?: ProjectBasicsData;
  questionnaire?: Record<string, string>;
  lastModified: string;
}

/**
 * A single chat history entry as persisted in the backend.
 * The frontend converts these to ChatBotHistoryItem[] for display.
 */
export interface ChatHistoryEntry {
  user: string;
  chatbot: string;
  metadata: string;
}

/**
 * A source reference returned by the RAG pipeline.
 */
export interface ChatMessageSource {
  title: string;
  uri: string;
}

/**
 * Raw draft record shape returned by the API before client-side mapping.
 */
export interface RawDraftRecord {
  sessionId: string;
  title?: string;
  documentIdentifier?: string;
  status?: string;
  lastModified?: string;
}

/**
 * Raw NOFO data shape returned by the S3 NOFO listing API.
 */
export interface RawNOFOData {
  name: string;
  status: string;
  isPinned?: boolean;
  expiration_date?: string | null;
  grant_type?: string | null;
  agency?: string | null;
  category?: string | null;
}
