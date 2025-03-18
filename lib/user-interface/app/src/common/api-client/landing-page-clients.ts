import { Utils } from '../utils';

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
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        }
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error retrieving NOFOs:', error);
      throw error;
    }
  }

  // Return NOFO summary from S3 bucket
  async getNOFOSummary(documentKey) {
    try {
      const token = await Utils.authenticate();
      const url = new URL(`${this.API}/s3-nofo-summary`);
      url.searchParams.append('documentKey', documentKey);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        }
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error retrieving NOFO summary:', error);
      throw error;
    }
  }

  // Fetches a signed upload URL from the backend Lambda for uploading a file to S3
  async getUploadURL(fileName: string, fileType: string): Promise<string> {
    if (!fileType) {
      alert('Must have a valid file type!');
      throw new Error('Invalid file type');
    }
    
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.API}/test-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ fileName, fileType })
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting upload URL:', error);
      throw error;
    }
  }

  // Uploads the file to S3 using the presigned URL provided by the backend
  async uploadFileToS3(url: string, file: File) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw error;
    }
  }

  // Invites a new user to the application
  async inviteUser(email: string) {
    try {
      const token = await Utils.authenticate();
      const response = await fetch(`${this.baseUrl}/user-management/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Error inviting user:', error);
      throw error;
    }
  }
} 