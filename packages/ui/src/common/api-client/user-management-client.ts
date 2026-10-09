import { Utils } from '../utils';
import { AppConfig } from '../types/app';
import type {
  CurrentFeatureRolloutAccess,
  FeatureRolloutConfig,
  FeatureRolloutMode,
  FeatureRolloutSearchResponse,
} from "../types/feature-rollout";
import type { ManagedUsersResponse, UserRolePreset } from "../types/user-management";
import { apiFetch } from "../session-ended";

/** Checks the status before parsing: a failed call may carry an HTML gateway page, not JSON. */
async function readJson(response: Response) {
  if (!response.ok) {
    let message = "";
    try {
      const body = JSON.parse(await response.text());
      if (typeof body?.message === "string") message = body.message;
    } catch {
      // Not JSON; fall back to the status.
    }
    throw new Error(message || `Request failed (HTTP ${response.status})`);
  }
  return response.json();
}

export class UserManagementClient {
  private readonly baseUrl: string;

  constructor(appConfig: AppConfig) {
    this.baseUrl = appConfig.httpEndpoint;
  }

  private async getAuthHeaders() {
    const token = await Utils.authenticate();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async listUsers(options?: {
    limit?: number;
    paginationToken?: string | null;
    query?: string;
  }): Promise<ManagedUsersResponse> {
    const headers = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}/user-management/users`);
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }
    if (options?.paginationToken) {
      url.searchParams.set("paginationToken", options.paginationToken);
    }
    if (options?.query?.trim()) {
      url.searchParams.set("query", options.query.trim());
    }

    const response = await apiFetch(url, {
      method: "GET",
      headers,
    });

    return readJson(response);
  }

  async createUser(options: { email: string; state?: string }) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(`${this.baseUrl}/user-management/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: options.email,
        ...(options.state ? { state: options.state } : {}),
      }),
    });

    return readJson(response);
  }

  async deleteUser(username: string) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/user-management/users/${encodeURIComponent(username)}`,
      {
        method: "DELETE",
        headers,
      }
    );

    return readJson(response);
  }

  async resetUserMfa(username: string) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/user-management/users/${encodeURIComponent(username)}/mfa-reset`,
      {
        method: "POST",
        headers,
      }
    );

    return readJson(response);
  }

  async updateUserRole(username: string, rolePreset: UserRolePreset) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/user-management/users/${encodeURIComponent(username)}/roles`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ rolePreset }),
      }
    );

    return readJson(response);
  }

  async updateUserState(username: string, state: string) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/user-management/users/${encodeURIComponent(username)}/roles`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ state }),
      }
    );

    return readJson(response);
  }

  async getCurrentFeatureAccess(): Promise<CurrentFeatureRolloutAccess> {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(`${this.baseUrl}/feature-rollouts/me`, {
      method: "GET",
      headers,
    });

    return readJson(response);
  }

  async getFeatureRollout(featureKey: string): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "GET",
      headers,
    });

    return readJson(response);
  }

  async updateFeatureRollout(featureKey: string, mode: FeatureRolloutMode): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mode }),
    });

    return readJson(response);
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

    const response = await apiFetch(url, {
      method: "GET",
      headers,
    });

    return readJson(response);
  }

  async grantFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "PUT",
        headers,
      }
    );

    return readJson(response);
  }

  async revokeFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await apiFetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers,
      }
    );

    return readJson(response);
  }
} 
