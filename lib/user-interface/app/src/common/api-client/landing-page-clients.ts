import { Utils } from "../utils";

export class LandingPageClient {
  private readonly baseUrl: string;
  private readonly API: string;

  constructor(appConfig: any) {
    this.baseUrl = appConfig.httpEndpoint;
    this.API = appConfig.httpEndpoint;
  }

  // Returns a list of documents in the S3 bucket (hard-coded on the backend)
  async getNOFOs() {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/s3-nofo-bucket-data`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error retrieving NOFOs:", error);
      throw error;
    }
  }

  // Return NOFO summary from S3 bucket
  async getNOFOSummary(documentKey) {
    try {
      const token = await Utils.authenticate();
      const url = new URL(`${this.API}/s3-nofo-summary`);
      url.searchParams.append("documentKey", documentKey);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error retrieving NOFO summary:", error);
      throw error;
    }
  }

  // Return NOFO questions from S3 bucket
  async getNOFOQuestions(documentKey) {
    try {
      const token = await Utils.authenticate();
      const url = new URL(`${this.API}/s3-nofo-questions`);
      url.searchParams.append("documentKey", documentKey);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error retrieving NOFO questions:", error);
      throw error;
    }
  }

  // Fetches a signed upload URL from the backend Lambda for uploading a file to S3
  async getUploadURL(fileName: string, fileType: string): Promise<string> {
    if (!fileType) {
      alert("Must have a valid file type!");
      throw new Error("Invalid file type");
    }

    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/test-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({ fileName, fileType }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error("Error getting upload URL:", error);
      throw error;
    }
  }

  // Uploads the file to S3 using the presigned URL provided by the backend
  async uploadFileToS3(url: string, file: File) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw error;
    }
  }

  // Renames a NOFO folder in S3
  async renameNOFO(oldName: string, newName: string) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/s3-nofo-rename`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          oldName,
          newName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error renaming NOFO:", error);
      throw error;
    }
  }

  // Deletes a NOFO folder and all its contents from S3
  async deleteNOFO(nofoName: string) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/s3-nofo-delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({ nofoName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error deleting NOFO:", error);
      throw error;
    }
  }

  // Updates a NOFO's status (active or archived), pinned state, expiration date, and grant type
  async updateNOFOStatus(
    nofoName: string, 
    status?: "active" | "archived", 
    isPinned?: boolean, 
    expirationDate?: string | null,
    grantType?: "federal" | "state" | "quasi" | "philanthropic" | "unknown"
  ) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/s3-nofo-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({ nofoName, status, isPinned, expirationDate, grantType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error updating NOFO:", error);
      throw error;
    }
  }

  // Triggers the automated NOFO scraper
  async triggerAutomatedScraper() {
    try {
      const token = await Utils.authenticate();
      
      const url = `${this.baseUrl}automated-nofo-scraper`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error triggering automated NOFO scraper:", error);
      throw error;
    }
  }

}
