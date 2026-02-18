import { Utils } from "../utils";
import { AppConfig } from "../types/app";

export class KBSyncClient {
  private readonly API: string;

  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0, -1);
  }

  async isSyncing(): Promise<string> {
    const auth = await Utils.authenticate();
    const response = await fetch(`${this.API}/kb-sync/still-syncing`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to check sync status");
    }
    return await response.json();
  }

  async lastSync(): Promise<string> {
    const auth = await Utils.authenticate();
    const response = await fetch(`${this.API}/kb-sync/get-last-sync`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to check last sync");
    }
    return await response.json();
  }
}
