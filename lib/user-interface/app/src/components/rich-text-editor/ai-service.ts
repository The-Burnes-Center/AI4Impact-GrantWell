import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";
import { Auth } from "aws-amplify";

export interface AiGenerationRequest {
  prompt: string;
  sessionId: string;
  documentIdentifier: string;
  sectionTitle: string;
  projectBasics?: Record<string, any>;
  questionnaire?: Record<string, any>;
}

export interface AiGenerationResponse {
  content: string;
  success: boolean;
  error?: string;
}

export class AiService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Generates content for a document section using Claude API via AWS Bedrock
   */
  async generateSectionContent(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    try {
      // Get authentication token
      const token = await Utils.authenticate();
      
      // Get the current draft to ensure we have the latest data
      const currentDraft = await this.apiClient.drafts.getDraft({
        sessionId: request.sessionId,
        userId: (await Auth.currentAuthenticatedUser()).username
      });

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      // Generate content using the draft generator
      const result = await this.apiClient.drafts.generateDraft({
        query: request.prompt,
        documentIdentifier: request.documentIdentifier,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId: request.sessionId
      });

      if (!result || !result[request.sectionTitle]) {
        throw new Error('Failed to generate content for section');
      }

      // Update the draft with the new section content
      await this.apiClient.drafts.updateDraft({
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [request.sectionTitle]: result[request.sectionTitle]
        }
      });

      return {
        content: result[request.sectionTitle],
        success: true
      };
    } catch (error) {
      console.error('Error generating section content:', error);
      return {
        content: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generates all sections for a draft
   */
  async generateAllSections(sessionId: string, documentIdentifier: string): Promise<AiGenerationResponse> {
    try {
      const currentDraft = await this.apiClient.drafts.getDraft({
        sessionId,
        userId: (await Auth.currentAuthenticatedUser()).username
      });

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      const result = await this.apiClient.drafts.generateDraft({
        query: "Generate all sections for the grant application",
        documentIdentifier,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId
      });

      if (!result) {
        throw new Error('Failed to generate sections');
      }

      // Update the draft with all generated sections
      await this.apiClient.drafts.updateDraft({
        ...currentDraft,
        sections: result
      });
      
      return {
        content: JSON.stringify(result),
        success: true
      };
    } catch (error) {
      console.error('Error generating all sections:', error);
      return {
        content: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}