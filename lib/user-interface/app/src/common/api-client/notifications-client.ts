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

  // Developer-only: the real digest for the calling developer — the server runs the actual
  // selection (their prefs + the active NOFO pool), so this is what they'd truly receive.
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

  // Developer-only: fire the REAL digest on demand (not a [TEST] preview). scope "me" sends only to
  // the caller, "all" sends to every subscribed user — real subject, real unsubscribe link, exactly
  // what a user would receive. Runs in the background; nothing is sent if no grants match.
  async broadcastDigest(
    frequency: "daily" | "weekly",
    scope: "me" | "all"
  ): Promise<{ started?: boolean; message: string; frequency?: string; scope?: string }> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/notification-digest/broadcast`);
    url.searchParams.append("frequency", frequency);
    url.searchParams.append("scope", scope);
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
  // Number of grants that actually matched the caller's prefs this window (0 = empty digest).
  count?: number;
}
