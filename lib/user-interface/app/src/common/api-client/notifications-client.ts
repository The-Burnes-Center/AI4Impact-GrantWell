import { Utils } from "../utils";
import { AppConfig } from "../types/app";

export type DigestFrequency = "off" | "daily" | "weekly";

export interface NotificationPrefs {
  frequency: DigestFrequency;
  // Fixed to the user's assigned state; set server-side, not client-editable.
  state: string;
  categories: string[];
  keywords: string[];
  last_sent: string | null;
}

export class NotificationsClient {
  private readonly API: string;

  constructor(appConfig: AppConfig) {
    this.API = appConfig.httpEndpoint;
  }

  async getPrefs(): Promise<NotificationPrefs> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/notification-prefs`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  async updatePrefs(
    prefs: Pick<NotificationPrefs, "frequency" | "categories" | "keywords">
  ): Promise<NotificationPrefs> {
    const token = await Utils.authenticate();
    const response = await fetch(`${this.API}/notification-prefs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  async getDigestPreview(
    frequency: "daily" | "weekly",
    overrides?: Partial<DigestConfig>
  ): Promise<DigestPreviewResult> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/notification-digest/preview`);
    url.searchParams.append("frequency", frequency);
    if (overrides) {
      for (const [k, v] of Object.entries(overrides)) {
        if (v) url.searchParams.append(k, v);
      }
    }
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  // Developer-only: persist the digest copy + branding the real emails use.
  async saveDigestConfig(
    frequency: "daily" | "weekly",
    config: DigestConfig
  ): Promise<DigestPreviewResult> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/notification-digest/preview`);
    url.searchParams.append("frequency", frequency);
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }

  // Developer-only: send the sample digest to your own email.
  async sendTestDigest(frequency: "daily" | "weekly"): Promise<{ message: string }> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/notification-digest/preview`);
    url.searchParams.append("frequency", frequency);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }
}

export interface DigestConfig {
  subject: string;
  intro: string;
  footer: string;
  appName: string;
  brandColor: string;
  logoUrl: string;
}

export interface DigestPreviewResult {
  config: DigestConfig;
  rendered: { subject: string; html: string; text: string };
}
