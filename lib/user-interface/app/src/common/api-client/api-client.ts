import { AppConfig } from "../types/app";
import { SessionsClient } from "./sessions-client";
import { UserDocumentsClient } from "./user-documents-client";
import { KBSyncClient } from "./kb-sync-client";
import { LandingPageClient } from "./landing-page-clients";
import { UserManagementClient } from "./user-management-client";
import { DraftsClient } from "./drafts-client";

export class ApiClient {
  private _sessionsClient: SessionsClient | undefined;
  private _userDocumentsClient: UserDocumentsClient | undefined;
  private _kbSyncClient: KBSyncClient | undefined;
  private _landingPageClient: LandingPageClient | undefined;
  private _userManagementClient: UserManagementClient | undefined;
  private _draftsClient: DraftsClient | undefined;

  public get userDocuments() {
    if (!this._userDocumentsClient) {
      this._userDocumentsClient = new UserDocumentsClient(this._appConfig);
    }
    return this._userDocumentsClient;
  }

  public get kbSync() {
    if (!this._kbSyncClient) {
      this._kbSyncClient = new KBSyncClient(this._appConfig);
    }
    return this._kbSyncClient;
  }

  public get landingPage() {
    if (!this._landingPageClient) {
      this._landingPageClient = new LandingPageClient(this._appConfig);
    }
    return this._landingPageClient;
  }

  public get sessions() {
    if (!this._sessionsClient) {
      this._sessionsClient = new SessionsClient(this._appConfig);
    }
    return this._sessionsClient;
  }

  public get drafts() {
    if (!this._draftsClient) {
      this._draftsClient = new DraftsClient(this._appConfig);
    }
    return this._draftsClient;
  }

  public get userManagement() {
    if (!this._userManagementClient) {
      this._userManagementClient = new UserManagementClient(this._appConfig);
    }
    return this._userManagementClient;
  }

  constructor(protected _appConfig: AppConfig) {}
}
