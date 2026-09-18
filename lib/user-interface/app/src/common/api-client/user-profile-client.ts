import { Utils } from "../utils";
import { AppConfig } from "../types/app";

export interface UserProfile {
  agency: string;
  organization: string;
  jobTitle: string;
  state: string;
  profileComplete: boolean;
}

export type UserProfileInput = Pick<
  UserProfile,
  "agency" | "organization" | "jobTitle"
>;

export interface RecentlyViewedItem {
  label: string;
  value: string;
  lastViewed: string;
}

export class UserProfileClient {
  private readonly API: string;

  constructor(appConfig: AppConfig) {
    this.API = appConfig.httpEndpoint;
  }

  async getProfile(): Promise<UserProfile> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/user-profile`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  async updateProfile(profile: UserProfileInput): Promise<UserProfile> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/user-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      const message = await response
        .json()
        .then((b: { message?: string }): string | null => b?.message ?? null)
        .catch((): string | null => null);
      throw new Error(message || `Error: ${response.status}`);
    }
    return response.json();
  }

  async getRecentlyViewed(): Promise<RecentlyViewedItem[]> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/user-profile/recently-viewed`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const body = (await response.json()) as { items?: RecentlyViewedItem[] };
    return body.items ?? [];
  }

  /** `replace` overwrites what other devices recorded; correct only when pruning. */
  async putRecentlyViewed(
    items: RecentlyViewedItem[],
    mode: "merge" | "replace" = "merge"
  ): Promise<RecentlyViewedItem[]> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/user-profile/recently-viewed`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ items, mode }),
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const body = (await response.json()) as { items?: RecentlyViewedItem[] };
    return body.items ?? [];
  }
}
