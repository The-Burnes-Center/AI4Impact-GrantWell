import { AppConfig } from "../types";
import { SessionsClient } from "./sessions-client";
import { KnowledgeManagementClient } from "./knowledge-management-client";
import { UserFeedbackClient } from "./user-feedback-client";
import { LandingPageClient } from "./landing-page-clients";
import { UserManagementClient } from "./user-management-client";

export class ApiClient {
  private _sessionsClient: SessionsClient | undefined;
  private _knowledgeManagementClient: KnowledgeManagementClient | undefined;
  private _userFeedbackClient: UserFeedbackClient | undefined;
  private _landingPageClient: LandingPageClient | undefined;
  private _userManagementClient: UserManagementClient | undefined;

  /** Construct the Knowledge Management sub-client */
  public get knowledgeManagement() {
    if (!this._knowledgeManagementClient) {
      this._knowledgeManagementClient = new KnowledgeManagementClient(this._appConfig);      
    }
    return this._knowledgeManagementClient;
  }

  /** Construct the landing page sub-client */
  public get landingPage() {
    if (!this._landingPageClient) {
      this._landingPageClient = new LandingPageClient(this._appConfig);      
    }
    return this._landingPageClient;
  }

  /** Construct the Sessions sub-client */
  public get sessions() {
    if (!this._sessionsClient) {
      this._sessionsClient = new SessionsClient(this._appConfig);
    }
    return this._sessionsClient;
  }

  /** Construct the Feedback sub-client */
  public get userFeedback() {
    if (!this._userFeedbackClient) {
      this._userFeedbackClient = new UserFeedbackClient(this._appConfig);
    }
    return this._userFeedbackClient;
  }

  /** Construct the User Management sub-client */
  public get userManagement() {
    if (!this._userManagementClient) {
      this._userManagementClient = new UserManagementClient(this._appConfig);
    }
    return this._userManagementClient;
  }

  constructor(protected _appConfig: AppConfig) {}
}
