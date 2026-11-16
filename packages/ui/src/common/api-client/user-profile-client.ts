import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import { apiFetch } from "../session-ended";

/** The user-profile function cuts longer department, organization and role values (MAX_FIELD). */
export const PROFILE_FIELD_MAX_LENGTH = 200;

export interface UserProfile {
  agency: string;
  organization: string;
  jobTitle: string;
  /** Empty when unset or when the deployment asks no Region question. */
  region: string;
  state: string;
  profileComplete: boolean;
}

/** The profile on a deployment with the structured profile step (PROFILE_FORM). */
export interface FormProfile {
  /** Empty for a profile saved by the old form, which then counts as incomplete. */
  applicantType: string;
  /** The typed organization name or the chosen entity; empty when the type asks neither. */
  organization: string;
  jobTitle: string;
  locations: string[];
  state: string;
  profileComplete: boolean;
}

export type UserProfileInput = Pick<
  UserProfile,
  "agency" | "organization" | "jobTitle"
> & { region?: string };

export type FormProfileInput = Pick<FormProfile, "applicantType" | "organization" | "jobTitle" | "locations">;

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

  async getProfile(): Promise<UserProfile & Partial<FormProfile>> {
    const token = await Utils.authenticate();
    const response = await apiFetch(`${this.API}/user-profile`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  async updateProfile(profile: UserProfileInput | FormProfileInput): Promise<UserProfile & Partial<FormProfile>> {
    const token = await Utils.authenticate();
    const response = await apiFetch(`${this.API}/user-profile`, {
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
    const response = await apiFetch(`${this.API}/user-profile/recently-viewed`, {
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
    const response = await apiFetch(`${this.API}/user-profile/recently-viewed`, {
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
