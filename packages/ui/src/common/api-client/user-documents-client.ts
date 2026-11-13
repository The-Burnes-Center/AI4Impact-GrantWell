import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import { apiFetch } from "../session-ended";
import type { DocumentRelevance, DocumentType, LibraryDocument } from "../helpers/user-documents";

export interface DocumentTypeInput {
  type: DocumentType;
  description?: string;
}

/** One "This is related" request, as the admins' queue lists it. */
export interface DocumentReview {
  userId: string;
  key: string;
  fileName: string;
  grant: string;
  typeLabel: string | null;
  reason: string | null;
  verdict: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  userEmail: string | null;
  userState: string | null;
  adminNote: string | null;
  decidedAt: string | null;
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.message === "string" && body.message) return body.message;
  } catch {
    // not JSON
  }
  return fallback;
}

/** Every call takes an object's real key: older uploads keep their per-grant keys. */
export class UserDocumentsClient {
  private readonly API: string;

  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const auth = await Utils.authenticate();
    return apiFetch(`${this.API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });
  }

  async getUploadURL(key: string, fileType: string, fileSize: number, documentType?: DocumentTypeInput): Promise<string> {
    if (!fileType) {
      throw new Error("Must have valid file type");
    }
    const response = await this.post("/user-documents/upload-url", {
      fileName: key,
      fileType,
      fileSize,
      ...(documentType && { documentType: documentType.type, description: documentType.description }),
    });
    if (!response.ok) {
      let message = "Failed to get upload URL";
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // response was not JSON; fall through to generic message
      }
      throw new Error(message);
    }
    const data = await response.json();
    return data.signedUrl;
  }

  async getDownloadURL(key: string): Promise<string> {
    const response = await this.post("/user-documents/download-url", { fileName: key });
    if (!response.ok) {
      throw new Error("Failed to get download URL");
    }
    const data = await response.json();
    return data.signedUrl;
  }

  /** The whole library, older per-grant uploads included. */
  async listDocuments(): Promise<LibraryDocument[]> {
    const response = await this.post("/user-documents/list", {});
    if (!response.ok) {
      throw new Error("Failed to get files");
    }
    const data = await response.json();
    return Array.isArray(data?.documents) ? data.documents : [];
  }

  async setDocumentType(key: string, documentType: DocumentTypeInput): Promise<void> {
    const response = await this.post("/user-documents/type", { key, ...documentType });
    if (!response.ok) throw new Error(await messageOf(response, "The type couldn't be saved"));
  }

  /** Each document's standing for the grant; with check (the default) unchecked ones are checked now. */
  async getRelevance(documentIdentifier: string, documentKeys: string[], { check = true } = {}): Promise<DocumentRelevance[]> {
    const response = await this.post("/user-documents/relevance", { documentIdentifier, documentKeys, check });
    if (!response.ok) throw new Error(await messageOf(response, "The documents couldn't be checked"));
    const data = await response.json();
    return Array.isArray(data?.documents) ? data.documents : [];
  }

  async requestRelevanceReview(documentIdentifier: string, key: string, note: string): Promise<DocumentRelevance> {
    const response = await this.post("/user-documents/relevance/review", { documentIdentifier, key, note });
    if (!response.ok) throw new Error(await messageOf(response, "Your request couldn't be sent"));
    return await response.json();
  }

  async listDocumentReviews(status: "pending" | "decided"): Promise<DocumentReview[]> {
    const auth = await Utils.authenticate();
    const response = await apiFetch(`${this.API}/admin/document-reviews?status=${status}`, {
      headers: { Authorization: auth },
    });
    if (!response.ok) throw new Error(await messageOf(response, "Document reviews couldn't be loaded"));
    const data = await response.json();
    return Array.isArray(data?.reviews) ? data.reviews : [];
  }

  async decideDocumentReview(review: Pick<DocumentReview, "userId" | "key" | "grant">, decision: "approve" | "reject", note: string): Promise<DocumentReview> {
    const response = await this.post("/admin/document-reviews", { action: decision, userId: review.userId, key: review.key, grant: review.grant, note });
    if (!response.ok) throw new Error(await messageOf(response, "The decision couldn't be saved"));
    return (await response.json()).review;
  }

  async openReviewedDocument(review: Pick<DocumentReview, "userId" | "key" | "grant">): Promise<string> {
    const response = await this.post("/admin/document-reviews", { action: "open", userId: review.userId, key: review.key, grant: review.grant });
    if (!response.ok) throw new Error(await messageOf(response, "The document couldn't be opened"));
    return (await response.json()).url;
  }

  async deleteFile(key: string) {
    const response = await this.post("/user-documents/delete", { KEY: key });
    if (!response.ok) {
      throw new Error("Failed to delete file");
    }
    return await response.json();
  }
}
