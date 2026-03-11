import { Utils } from "../utils";
import { AppConfig } from "../types/app";

export class UserDocumentsClient {
  private readonly API: string;

  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0, -1);
  }

  async getUploadURL(
    fileName: string,
    fileType: string,
    userId: string,
    nofoName: string
  ): Promise<string> {
    if (!fileType) {
      throw new Error("Must have valid file type");
    }

    const auth = await Utils.authenticate();
    const filePath = `${userId}/${nofoName}/${fileName}`;

    const response = await fetch(`${this.API}/user-documents/upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ fileName: filePath, fileType }),
    });

    if (!response.ok) {
      throw new Error("Failed to get upload URL");
    }

    const data = await response.json();
    return data.signedUrl;
  }

  async getDownloadURL(
    fileName: string,
    userId: string,
    nofoName: string
  ): Promise<string> {
    const auth = await Utils.authenticate();
    const filePath = `${userId}/${nofoName}/${fileName}`;

    const response = await fetch(`${this.API}/user-documents/download-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ fileName: filePath }),
    });

    if (!response.ok) {
      throw new Error("Failed to get download URL");
    }

    const data = await response.json();
    return data.signedUrl;
  }

  async getDocuments(
    userId: string,
    nofoName: string,
    continuationToken?: string,
    pageIndex?: number
  ) {
    const auth = await Utils.authenticate();
    const folderPrefix = `${userId}/${nofoName}/`;

    const response = await fetch(`${this.API}/user-documents/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        folderPrefix,
        continuationToken,
        pageIndex,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get files");
    }
    return await response.json();
  }

  async deleteFile(userId: string, nofoName: string, fileName: string) {
    const auth = await Utils.authenticate();
    const key = `${userId}/${nofoName}/${fileName}`;

    const response = await fetch(`${this.API}/user-documents/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ KEY: key }),
    });

    if (!response.ok) {
      throw new Error("Failed to delete file");
    }
    return await response.json();
  }
}
