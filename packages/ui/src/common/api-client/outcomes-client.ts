import { Utils } from "../utils";
import { AppConfig } from "../types/app";
import { apiFetch } from "../session-ended";
import type { OutcomeInput, OutcomeStatus } from "../application-outcomes";

export interface ApplicationOutcome {
  sessionId: string;
  status: OutcomeStatus;
  submittedDate: string | null;
  decisionDate: string | null;
  amountAwarded: number | null;
  updatedAt: string | null;
}

export interface DueApplication {
  sessionId: string;
  title: string;
  grant: string;
  /** Null for rolling grants and grants no longer listed. */
  deadline: string | null;
  status: OutcomeStatus | null;
  submittedDate: string | null;
}

export interface AdminOutcome {
  email: string;
  /** The account was deleted; the row stays without the user. */
  deleted: boolean;
  organization: string;
  region: string;
  state: string;
  grant: string;
  title: string;
  status: OutcomeStatus;
  requestedAmount: string;
  amountAwarded: number | null;
  submittedDate: string | null;
  decisionDate: string | null;
  updatedAt: string | null;
}

export class OutcomesClient {
  private readonly API: string;

  constructor(appConfig: AppConfig) {
    this.API = appConfig.httpEndpoint;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await Utils.authenticate();
    const response = await apiFetch(`${this.API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: token },
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

  async list(): Promise<ApplicationOutcome[]> {
    return (await this.request<{ outcomes: ApplicationOutcome[] }>("/application-outcomes")).outcomes;
  }

  async due(): Promise<DueApplication[]> {
    return (await this.request<{ due: DueApplication[] }>("/application-outcomes/due")).due;
  }

  async record(sessionId: string, outcome: OutcomeInput): Promise<ApplicationOutcome> {
    return this.request(`/application-outcomes/${encodeURIComponent(sessionId)}`, {
      method: "PUT",
      body: JSON.stringify(outcome),
    });
  }

  async snooze(sessionIds: string[]): Promise<void> {
    await this.request("/application-outcomes/snooze", { method: "POST", body: JSON.stringify({ sessionIds }) });
  }

  async adminList(state?: string): Promise<AdminOutcome[]> {
    const query = state ? `?state=${encodeURIComponent(state)}` : "";
    return (await this.request<{ outcomes: AdminOutcome[] }>(`/admin/application-outcomes${query}`)).outcomes;
  }
}
