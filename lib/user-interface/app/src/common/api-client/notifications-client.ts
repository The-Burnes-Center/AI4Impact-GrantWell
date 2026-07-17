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

  // Developer-only: the real digest template rendered with sample data. Copy + branding come
  // from the instance config (server-side), so this is a faithful, read-only preview.
  async getDigestPreview(
    frequency: "daily" | "weekly"
  ): Promise<DigestPreviewResult> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/notification-digest/preview`);
    url.searchParams.append("frequency", frequency);
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
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

export interface DigestPreviewResult {
  rendered: { subject: string; html: string; text: string };
}
