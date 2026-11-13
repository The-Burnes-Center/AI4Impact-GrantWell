import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import { apiFetch } from "../session-ended";
import type { LibraryDocument } from "../helpers/user-documents";

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

  async getUploadURL(key: string, fileType: string, fileSize: number): Promise<string> {
    if (!fileType) {
      throw new Error("Must have valid file type");
    }
    const response = await this.post("/user-documents/upload-url", { fileName: key, fileType, fileSize });
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

  async deleteFile(key: string) {
    const response = await this.post("/user-documents/delete", { KEY: key });
    if (!response.ok) {
      throw new Error("Failed to delete file");
    }
    return await response.json();
  }
}
