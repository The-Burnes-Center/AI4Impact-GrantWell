import { Utils } from '../utils';
import { AppConfig } from '../types/app';

export class UserManagementClient {
  private readonly baseUrl: string;

  constructor(appConfig: AppConfig) {
    this.baseUrl = appConfig.httpEndpoint;
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