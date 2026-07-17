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
}
