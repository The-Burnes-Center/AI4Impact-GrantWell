import {
  Utils
} from "../utils"

import { AppConfig } from "../types/app";

export class KnowledgeManagementClient {

  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0,-1);
  }
  
  // Helper to extract NOFO name from documentIdentifier
  private extractNofoName(documentIdentifier: string): string {
    // e.g., "grants/2024/transportation-grant-001" -> "transportation-grant-001"
    return documentIdentifier.split("/").pop() || documentIdentifier;
  }
  
  // Returns a URL from the this.API that allows one file upload to S3
  // fileName: just the filename (e.g., "mission-statement.pdf")
  // userId: the authenticated user's ID
  // nofoName: extracted from documentIdentifier
  async getUploadURL(fileName: string, fileType: string, userId: string, nofoName: string): Promise<string> {    
    if (!fileType) {
      alert('Must have valid file type!');
      return;
    }

    try {
      const auth = await Utils.authenticate();
      // Construct path: userId/nofoName/filename
      const filePath = `${userId}/${nofoName}/${fileName}`;
      
      const response = await fetch(`${this.API}/signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization' : auth
        },
        body: JSON.stringify({ fileName: filePath, fileType })
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  // Returns a list of documents in the S3 bucket
  // userId: the authenticated user's ID
  // nofoName: extracted from documentIdentifier
  async getDocuments(userId: string, nofoName: string, continuationToken?: string, pageIndex?: number) {
    const auth = await Utils.authenticate();
    // Construct folderPrefix: userId/nofoName/
    const folderPrefix = `${userId}/${nofoName}/`;
    
    const response = await fetch(this.API + '/s3-bucket-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        folderPrefix: folderPrefix,
        continuationToken: continuationToken,
        pageIndex: pageIndex,
      }),

    });
    if (!response.ok) {
      throw new Error('Failed to get files');
    }
    const result = await response.json();
    return result;
  }

  // Deletes a given file on the S3 bucket
  // userId: the authenticated user's ID
  // nofoName: extracted from documentIdentifier
  // fileName: just the filename (e.g., "mission-statement.pdf")
  async deleteFile(userId: string, nofoName: string, fileName: string) {
    const auth = await Utils.authenticate();
    // Construct key: userId/nofoName/filename
    const key = `${userId}/${nofoName}/${fileName}`;
    
    const response = await fetch(this.API + '/delete-s3-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        KEY : key
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
    return await response.json()
  }

  // Runs a sync job on Kendra (hardcoded datasource as well as index on the backend)
  async syncKendra() : Promise<string> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/kb-sync/sync-kb', {headers: {
      'Content-Type': 'application/json',
      'Authorization' : auth
    }})
    if (!response.ok) {
      throw new Error('Failed to sync');
    }
    return await response.json()
  }

  // Checks if Kendra is currently syncing (used to disable the sync button)
  async kendraIsSyncing() : Promise<string> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/kb-sync/still-syncing', {headers: {
      'Content-Type': 'application/json',
      'Authorization' : auth
    }})
    if (!response.ok) {
      throw new Error('Failed to check sync status');
    }
    return await response.json()
  }

  // Checks the last time Kendra was synced
  async lastKendraSync() : Promise<string> {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/kb-sync/get-last-sync', {headers: {
      'Content-Type': 'application/json',
      'Authorization' : auth
    }})
    if (!response.ok) {
      throw new Error('Failed to check last status');
    }
    return await response.json()
  }

}
