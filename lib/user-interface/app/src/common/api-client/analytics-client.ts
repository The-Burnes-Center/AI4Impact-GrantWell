import { Utils } from "../utils";
import { AppConfig } from "../types/app";

export type AnalyticsWindow = 7 | 30 | 90;

export interface StateUsage {
  state: string;
  stateName: string;
  registered: number;
  active: number;
}

export interface RankedItem {
  label: string;
  count: number;
}

export interface AgencyUsage {
  agency: string;
  state: string;
  events: number;
}

export interface DraftFunnelStage {
  stage: string;
  count: number;
}

export interface DraftFunnel {
  stages: DraftFunnelStage[];
  total: number;
  completed: number;
  abandoned: number;
  completionRate: number;
}

export interface AnalyticsData {
  window: AnalyticsWindow;
  generatedAt: string;
  usersByState: StateUsage[];
  totalRegistered: number;
  activeUsers: number;
  topSearches: RankedItem[];
  topViewedNofos: RankedItem[];
  topPursuedNofos: RankedItem[];
  draftsCreated: number;
  draftsDownloaded: number;
  draftsCompleted: number;
  usageByAgency: AgencyUsage[];
  draftFunnel: DraftFunnel;
}

export class AnalyticsClient {
  private readonly API: string;

  constructor(appConfig: AppConfig) {
    this.API = appConfig.httpEndpoint;
  }

  async getAnalytics(windowDays: AnalyticsWindow): Promise<AnalyticsData> {
    const token = await Utils.authenticate();
    const url = new URL(`${this.API}/admin/analytics`);
    url.searchParams.append("window", String(windowDays));
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  }
}
