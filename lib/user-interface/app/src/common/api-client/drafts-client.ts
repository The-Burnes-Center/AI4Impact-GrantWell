import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import type { ProjectBasicsData, RawDraftRecord } from "../types/document";

// Unified status that represents both the step and state in the grant writing flow
export type DraftStatus = 
  | 'project_basics'        // User is entering project basics
  | 'questionnaire'         // User is answering questionnaire
  | 'uploading_documents'   // User is uploading documents
  | 'generating_draft'      // Draft generation in progress
  | 'editing_sections'      // User is editing sections (draft exists)
  | 'reviewing'            // User is reviewing application
  | 'submitted';            // Application has been submitted

/** Write attribution stamped on the row; the stream consumer cannot infer it. */
export type DraftWriteSource =
  | 'autosave'
  | 'ai_generated'
  | 'ai_regenerated'
  | 'manual'
  | 'restore'
  | 'status_change';

export interface UploadedFileMeta {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface DocumentDraft {
  sessionId: string;
  userId: string;
  title: string;
  documentIdentifier: string;
  status?: DraftStatus;
  sections?: Record<string, string>;
  projectBasics?: ProjectBasicsData;
  questionnaire?: Record<string, string>;
  additionalInfo?: string;
  uploadedFiles?: UploadedFileMeta[];
  createdAt?: string;
  updatedAt?: string;
  lastModified?: string;
  rev?: number;
  lastWriteSource?: DraftWriteSource;
}

/** Thrown by updateDraft when the row moved on; `remote` is the server state. */
export class DraftConflictError extends Error {
  readonly remote: DocumentDraft | null;

  constructor(remote: DocumentDraft | null) {
    super('Draft was modified elsewhere');
    this.name = 'DraftConflictError';
    this.remote = remote;
  }
}

/**
 * One snapshot's metadata. `rev` holds the content as of that draft revision,
 * and `source` is the write that superseded it — so a row with source
 * `ai_regenerated` is the text from *before* that regeneration.
 */
export interface DraftVersionMeta {
  rev: number;
  created_at: string;
  source?: DraftWriteSource | 'manual_snapshot';
  label?: string;
  changed_sections?: string[];
  section_word_counts?: Record<string, number>;
  total_word_count?: number;
  oversize?: boolean;
}

export interface DraftVersionDetail extends DraftVersionMeta {
  content: {
    title?: string;
    status?: DraftStatus;
    sections?: Record<string, string>;
    project_basics?: ProjectBasicsData;
    questionnaire?: Record<string, string>;
    additional_info?: string;
    uploaded_files?: UploadedFileMeta[];
  } | null;
}

export interface DraftJobStatus {
  jobId: string;
  status: 'in_progress' | 'completed' | 'partial' | 'error';
  sectionNames?: string[];
  totalSections?: number;
  completedSectionCount?: number;
  sections?: Record<string, string>;
  failedSections?: string[];
  error?: string;
}

export class DraftsClient {
  private readonly API: string;

  constructor(config: AppConfig) {
    this.API = config.httpEndpoint;
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
        project_basics: draft.projectBasics || {},
        questionnaire: draft.questionnaire || {},
        status: draft.status || 'project_basics',
      }),
    });

    if (response.status !== 200) {
      const errorMessage = await response.json();
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private mapDraft(sessionId: string, userId: string, row: Record<string, unknown>): DocumentDraft {
    return {
      sessionId,
      userId,
      title: (row.title as string) || '',
      documentIdentifier: (row.document_identifier as string) || '',
      status: ((row.status as DraftStatus) || 'project_basics'),
      sections: (row.sections as Record<string, string>) || {},
      projectBasics: (row.project_basics as ProjectBasicsData) || {},
      questionnaire: (row.questionnaire as Record<string, string>) || {},
      additionalInfo: (row.additional_info as string) ?? '',
      uploadedFiles: (row.uploaded_files as UploadedFileMeta[]) || [],
      lastModified: (row.last_modified as string) || new Date().toISOString(),
      rev: typeof row.rev === 'number' ? row.rev : undefined,
      lastWriteSource: row.last_write_source as DraftWriteSource | undefined,
    };
  }

  /** Single-shot read; null when there is no such row. See waitForDraft. */
  async getDraft(params: { sessionId: string; userId: string }): Promise<DocumentDraft | null> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify({
        operation: 'get_draft',
        session_id: params.sessionId,
        user_id: params.userId,
      }),
    });

    if (response.status === 404) return null;

    if (response.status !== 200) {
      let detail = `HTTP ${response.status}`;
      try {
        detail = JSON.stringify(await response.json());
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Failed to fetch draft: ${detail}`);
    }

    const output = await response.json();

    // A missing row comes back as 200 with an empty object, or as a
    // "No record found" string from the older handler.
    if (!output || typeof output === 'string' || Object.keys(output).length === 0) {
      return null;
    }

    return this.mapDraft(params.sessionId, params.userId, output);
  }

  /** Polls until the row exists, for the window where the generation fan-out
   *  has not written it yet. */
  async waitForDraft(params: {
    sessionId: string;
    userId: string;
    onProgress?: (message: string, attempt: number, maxAttempts: number) => void;
    maxAttempts?: number;
    intervalMs?: number;
  }): Promise<DocumentDraft | null> {
    const maxAttempts = params.maxAttempts ?? 150; // ~5 minutes at 2s
    const intervalMs = params.intervalMs ?? 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const draft = await this.getDraft(params);
        if (draft) {
          if (params.onProgress && attempt > 1) {
            params.onProgress('Draft loaded successfully!', attempt, maxAttempts);
          }
          return draft;
        }
        params.onProgress?.(
          attempt === 1
            ? 'Waiting for draft generation to complete...'
            : attempt <= 15
              ? 'Draft generation in progress...'
              : attempt <= 30
                ? 'Draft generation is taking longer than expected...'
                : 'Still waiting for draft generation...',
          attempt,
          maxAttempts
        );
      } catch (error) {
        console.warn(`[waitForDraft] attempt ${attempt} failed:`, error);
        params.onProgress?.('Retrying...', attempt, maxAttempts);
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    params.onProgress?.('Draft generation timed out', maxAttempts, maxAttempts);
    return null;
  }

  private buildUpdatePayload(draft: DocumentDraft & { expectedRev?: number; writeSource?: DraftWriteSource }) {
    return {
      operation: 'update_draft',
      session_id: draft.sessionId,
      user_id: draft.userId,
      title: draft.title,
      document_identifier: draft.documentIdentifier,
      sections: draft.sections || {},
      project_basics: draft.projectBasics || {},
      questionnaire: draft.questionnaire || {},
      additional_info: draft.additionalInfo,
      uploaded_files: draft.uploadedFiles,
      last_modified: draft.lastModified || new Date().toISOString(),
      status: draft.status,
      expected_rev: draft.expectedRev,
      last_write_source: draft.writeSource,
    };
  }

  /** Pass expectedRev to make the write conditional; a losing write throws
   *  DraftConflictError carrying the current server state. */
  async updateDraft(
    draft: DocumentDraft & { expectedRev?: number; writeSource?: DraftWriteSource }
  ): Promise<DocumentDraft> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify(this.buildUpdatePayload(draft)),
    });

    if (response.status === 409) {
      let remote: DocumentDraft | null = null;
      try {
        const conflict = await response.json();
        if (conflict?.current) {
          remote = this.mapDraft(draft.sessionId, draft.userId, conflict.current);
        }
      } catch {
        /* fall through with remote=null; caller will re-read */
      }
      throw new DraftConflictError(remote);
    }

    if (response.status !== 200) {
      let detail = `HTTP ${response.status}`;
      try {
        detail = JSON.stringify(await response.json());
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Failed to save draft: ${detail}`);
    }

    const data = await response.json();
    return {
      ...draft,
      title: data.title ?? draft.title,
      sections: data.sections ?? draft.sections,
      projectBasics: data.projectBasics ?? draft.projectBasics,
      questionnaire: data.questionnaire ?? draft.questionnaire,
      additionalInfo: data.additionalInfo ?? draft.additionalInfo,
      uploadedFiles: data.uploadedFiles ?? draft.uploadedFiles,
      status: (data.status ?? draft.status) as DraftStatus,
      lastModified: data.lastModified ?? draft.lastModified,
      rev: typeof data.rev === 'number' ? data.rev : draft.rev,
    };
  }

  /**
   * Fire-and-forget save for page-exit paths. The caller supplies a token
   * because `beforeunload` cannot await one, and this uses keepalive rather
   * than sendBeacon because sendBeacon cannot set an Authorization header.
   */
  saveDraftOnExit(
    draft: DocumentDraft & { expectedRev?: number; writeSource?: DraftWriteSource },
    authToken: string
  ): void {
    try {
      void fetch(this.API + '/user-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken,
        },
        body: JSON.stringify(this.buildUpdatePayload(draft)),
        keepalive: true,
      });
    } catch (error) {
      console.warn('Exit-path draft save failed:', error);
    }
  }

  private async draftOperation<T>(body: Record<string, unknown>, what: string): Promise<T> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch((): null => null);
    if (response.status !== 200) {
      throw new Error(data?.message || data?.error || `Failed to ${what}: HTTP ${response.status}`);
    }
    return data as T;
  }

  async listVersions(params: { sessionId: string; limit?: number }): Promise<DraftVersionMeta[]> {
    const data = await this.draftOperation<{ versions: DraftVersionMeta[] }>(
      { operation: 'list_draft_versions', session_id: params.sessionId, limit: params.limit },
      'list versions'
    );
    return data?.versions || [];
  }

  async getVersion(params: { sessionId: string; rev: number }): Promise<DraftVersionDetail> {
    return this.draftOperation<DraftVersionDetail>(
      { operation: 'get_draft_version', session_id: params.sessionId, rev: params.rev },
      'read version'
    );
  }

  async restoreVersion(params: {
    sessionId: string;
    rev: number;
    sectionsOnly?: string[];
  }): Promise<{ restoredFrom: number; restoredSections: string[] }> {
    return this.draftOperation(
      {
        operation: 'restore_draft_version',
        session_id: params.sessionId,
        rev: params.rev,
        sections_only: params.sectionsOnly,
      },
      'restore version'
    );
  }

  async labelVersion(params: { sessionId: string; rev: number; label?: string }) {
    return this.draftOperation(
      {
        operation: 'label_draft_version',
        session_id: params.sessionId,
        rev: params.rev,
        label: params.label ?? null,
      },
      'label version'
    );
  }

  async createVersion(params: { sessionId: string; label?: string }) {
    return this.draftOperation<{ rev: number; label: string | null; oversize: boolean }>(
      { operation: 'create_draft_version', session_id: params.sessionId, label: params.label },
      'save version'
    );
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
        return data.map((draft: RawDraftRecord) => ({
          sessionId: draft.sessionId,
          userId: userId,
          title: draft.title || '',
          documentIdentifier: draft.documentIdentifier || '',
          status: (draft.status || 'project_basics') as DraftStatus,
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
        
        return drafts.map((draft: RawDraftRecord) => ({
          sessionId: draft.sessionId,
          userId: userId,
          title: draft.title || '',
          documentIdentifier: draft.documentIdentifier || '',
          status: (draft.status || 'project_basics') as DraftStatus,
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

  // Starts a draft generation job and returns the jobId immediately (no polling)
  async startDraftGeneration(params: {
    query: string;
    documentIdentifier: string;
    projectBasics?: ProjectBasicsData;
    questionnaire?: Record<string, string>;
    sessionId: string;
  }): Promise<string> {
    const auth = await Utils.authenticate();
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
        sessionId: params.sessionId,
      }),
    });

    if (response.status !== 200) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to start draft generation');
    }

    const data = await response.json();
    return data.jobId;
  }

  // Generates draft sections based on project basics and questionnaire
  // Uses async polling pattern with Step Functions fan-out
  async generateDraft(params: {
    query: string;
    documentIdentifier: string;
    projectBasics?: ProjectBasicsData;
    questionnaire?: Record<string, string>;
    sessionId: string;
    onProgress?: (status: string, pollCount?: number, maxPolls?: number) => void;
    onJobUpdate?: (jobStatus: DraftJobStatus) => void;
  }): Promise<{ jobId: string; sections: Record<string, string> }> {
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
      if (
        startResponse.status === 403 &&
        errorMessage?.error === "ACCESS_DENIED_STATE"
      ) {
        window.dispatchEvent(
          new CustomEvent("grantwell:access-denied", { detail: errorMessage })
        );
      }
      throw new Error(errorMessage.error || 'Failed to start draft generation');
    }

    const startData = await startResponse.json();
    const jobId = startData.jobId;
    console.log('Draft generation job started:', jobId);

    // Poll for job status
    let pollCount = 0;
    const maxPolls = 150; // Max 150 polls (~5 minutes with 2s interval)
    const pollInterval = 2000; // 2 seconds

    if (params.onProgress) {
      params.onProgress('in_progress', 0, maxPolls);
    }

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
          if (params.onProgress) params.onProgress('in_progress', pollCount, maxPolls);
          continue;
        }

        const statusData = await statusResponse.json();
        console.log(`[Polling] Job ${jobId} status: ${statusData.status}`);

        // Forward full job status for live section-level UI updates
        if (params.onJobUpdate) {
          params.onJobUpdate(statusData as DraftJobStatus);
        }

        if (statusData.status === 'completed' || statusData.status === 'partial') {
          console.log('Draft generation completed:', statusData.status);
          if (params.onProgress) params.onProgress(statusData.status, pollCount, maxPolls);
          return { jobId, sections: statusData.sections || {} };
        } else if (statusData.status === 'error') {
          throw new Error(statusData.error || 'Draft generation failed');
        }

        if (params.onProgress) params.onProgress('in_progress', pollCount, maxPolls);
      } catch (err) {
        console.error('[Polling] Error checking job status:', err);
        if (params.onProgress) params.onProgress('in_progress', pollCount, maxPolls);
      }
    }

    // If we've exhausted polls, throw an error
    throw new Error('Draft generation timed out. Please try again.');
  }

  // Polls a draft generation job for live status updates (used by SectionEditor)
  async pollDraftJob(jobId: string): Promise<DraftJobStatus> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + `/draft-generation-jobs/${jobId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + auth },
    });

    if (!response.ok) {
      throw new Error(`Job status check failed: ${response.status}`);
    }

    return await response.json() as DraftJobStatus;
  }

  // Generates a Word (.docx) document from draft data
  async generateDOCX(draftData: {
    title?: string;
    grantName?: string;
    projectBasics?: ProjectBasicsData;
    sections?: Record<string, string>;
  }): Promise<Blob> {
    const auth = await Utils.authenticate();
    console.log('Calling /generate-docx with:', draftData);

    const response = await fetch(this.API + '/generate-docx', {
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

    console.log('DOCX generation response status:', response.status);

    if (response.status !== 200) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || 'Failed to generate DOCX';
      } catch (e) {
        errorMessage = await response.text() || `Failed to generate DOCX: HTTP ${response.status}`;
      }
      console.error('DOCX generation error:', errorMessage);
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    console.log('DOCX blob created, size:', blob.size, 'bytes');
    return blob;
  }

  // Generates a tagged PDF from draft data
  async generatePDF(draftData: {
    title?: string;
    grantName?: string;
    projectBasics?: ProjectBasicsData;
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