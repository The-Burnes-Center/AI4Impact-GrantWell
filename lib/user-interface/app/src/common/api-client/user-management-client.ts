import { Utils } from '../utils';
import { AppConfig } from '../types/app';
import type {
  CurrentFeatureRolloutAccess,
  FeatureRolloutConfig,
  FeatureRolloutMode,
  FeatureRolloutSearchResponse,
} from "../types/feature-rollout";
import type { ManagedUsersResponse, UserRolePreset } from "../types/user-management";

export class UserManagementClient {
  private readonly baseUrl: string;

  constructor(appConfig: AppConfig) {
    this.baseUrl = appConfig.httpEndpoint.replace(/\/+$/, "");
  }

  private async getAuthHeaders() {
    const token = await Utils.authenticate();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  // Invites a new user to the application
  async inviteUser(email: string) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/user-management/invite-user`, {
        method: 'POST',
        headers,
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

  async listUsers(options?: {
    limit?: number;
    paginationToken?: string | null;
  }): Promise<ManagedUsersResponse> {
    const headers = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}/user-management/users`);
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }
    if (options?.paginationToken) {
      url.searchParams.set("paginationToken", options.paginationToken);
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async updateUserRole(username: string, rolePreset: UserRolePreset) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/user-management/users/${encodeURIComponent(username)}/roles`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ rolePreset }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async getCurrentFeatureAccess(): Promise<CurrentFeatureRolloutAccess> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/me`, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async getFeatureRollout(featureKey: string): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async updateFeatureRollout(featureKey: string, mode: FeatureRolloutMode): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mode }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async searchFeatureRolloutUsers(
    featureKey: string,
    query: string,
    role: "" | "admin" | "developer" = ""
  ): Promise<FeatureRolloutSearchResponse> {
    const headers = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users`);
    if (query.trim().length > 0) {
      url.searchParams.set("query", query.trim());
    }
    if (role) {
      url.searchParams.set("role", role);
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async grantFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "PUT",
        headers,
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async revokeFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers,
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }
} 
