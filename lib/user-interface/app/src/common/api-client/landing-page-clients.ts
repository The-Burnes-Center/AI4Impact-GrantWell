import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import type { ReviewItem, ReviewDetail, ProcessingMetrics } from "../types/processing-review";

export class LandingPageClient {
  private readonly baseUrl: string;
  private readonly API: string;

  constructor(appConfig: AppConfig) {
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
  async getNOFOSummary(documentKey: string) {
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
  async getNOFOQuestions(documentKey: string) {
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

  // Fetches a signed upload URL from the backend Lambda for uploading a file to S3.
  // The backend also writes the `<fileName>.metadata.json` sidecar for Bedrock KB
  // filtering, so `scope` and (when scope === "state") `state` are required.
  async getUploadURL(
    fileName: string,
    fileType: string,
    scope: "federal" | "state",
    state?: string
  ): Promise<string> {
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
        body: JSON.stringify({
          fileName,
          fileType,
          scope,
          ...(scope === "state" && state ? { state } : {}),
        }),
      });

      if (!response.ok) {
        let message = "Failed to get upload URL";
        try {
          const data = await response.json();
          if (data?.message) message = data.message;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
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

  // Updates a NOFO's status (active or archived), pinned state, expiration date, grant type, and category
  async updateNOFOStatus(
    nofoName: string,
    status?: "active" | "archived",
    isPinned?: boolean,
    expirationDate?: string | null,
    grantType?: "federal" | "state" | "quasi" | "philanthropic",
    category?: string,
    agency?: string,
    isRolling?: boolean
  ) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/s3-nofo-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({ nofoName, status, isPinned, expirationDate, grantType, category, agency, isRolling }),
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

  async updateNOFOSummary(nofoName: string, summary: Record<string, unknown>) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/s3-nofo-summary-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({ nofoName, summary }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error updating NOFO summary:", error);
      throw error;
    }
  }

  async submitFeedback(foundWhatLookingFor: "Yes" | "No", feedbackText: string) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/submit-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          found_what_looking_for: foundWhatLookingFor,
          feedback_text: feedbackText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error submitting feedback:", error);
      throw error;
    }
  }

  async getProcessingReviews(status?: string): Promise<ReviewItem[]> {
    try {
      const token = await Utils.authenticate();
      const url = new URL(`${this.API}/admin/processing-reviews`);
      if (status) url.searchParams.append("status", status);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: token },
      });

      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();
      return data.reviews || [];
    } catch (error) {
      console.error("Error fetching processing reviews:", error);
      throw error;
    }
  }

  async getReviewDetail(nofoName: string): Promise<ReviewDetail> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(
        `${this.API}/admin/processing-reviews/${encodeURIComponent(nofoName)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: token },
        }
      );

      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();
      return data.review;
    } catch (error) {
      console.error("Error fetching review detail:", error);
      throw error;
    }
  }

  async approveReview(
    nofoName: string,
    corrections?: Record<string, unknown>,
    notes?: string,
    reviewId?: string
  ): Promise<void> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(
        `${this.API}/admin/processing-reviews/${encodeURIComponent(nofoName)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
          body: JSON.stringify({ corrections, notes, reviewId }),
        }
      );

      if (!response.ok) throw new Error(`Error: ${response.status}`);
    } catch (error) {
      console.error("Error approving review:", error);
      throw error;
    }
  }

  async rejectReview(nofoName: string, reason: string, reviewId?: string): Promise<void> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(
        `${this.API}/admin/processing-reviews/${encodeURIComponent(nofoName)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
          body: JSON.stringify({ reason, reviewId }),
        }
      );

      if (!response.ok) throw new Error(`Error: ${response.status}`);
    } catch (error) {
      console.error("Error rejecting review:", error);
      throw error;
    }
  }

  async markNeedsReupload(nofoName: string, notes: string, reviewId?: string): Promise<void> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(
        `${this.API}/admin/processing-reviews/${encodeURIComponent(nofoName)}/needs-reupload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
          body: JSON.stringify({ notes, reviewId }),
        }
      );
      if (!response.ok) throw new Error(`Error: ${response.status}`);
    } catch (error) {
      console.error("Error marking review as needs re-upload:", error);
      throw error;
    }
  }

  async getReuploadUrl(nofoName: string, fileType: string): Promise<{ signedUrl: string; objectKey: string }> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/admin/reupload-nofo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ nofoName, fileType }),
      });

      if (!response.ok) throw new Error(`Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("Error getting re-upload URL:", error);
      throw error;
    }
  }

  async reprocessNofo(nofoName: string): Promise<void> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/admin/reprocess-nofo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ nofoName }),
      });

      if (!response.ok) throw new Error(`Error: ${response.status}`);
    } catch (error) {
      console.error("Error reprocessing NOFO:", error);
      throw error;
    }
  }

  async getProcessingMetrics(): Promise<ProcessingMetrics> {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/admin/processing-metrics`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: token },
      });

      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();
      return data.metrics;
    } catch (error) {
      console.error("Error fetching processing metrics:", error);
      throw error;
    }
  }

  // Triggers the automated NOFO scraper
  async triggerAutomatedScraper() {
    try {
      const token = await Utils.authenticate();
      
      const url = `${this.baseUrl}/automated-nofo-scraper`;
      
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
