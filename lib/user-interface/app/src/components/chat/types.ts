export interface ChatBotConfiguration {
  conversationStyle: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  stopSequences?: string[];
  anthropicVersion?: string;
}

export interface ChatInputState {
  value: string;
}

export enum ChatBotMessageType {
  Human = "Human",
  AI = "AI",
}

export interface ChatBotHistoryItem {
  type: ChatBotMessageType;
  content: string;
  metadata: Record<
    string,
    string | boolean | number | null | undefined | string[] | string[][]
  >;
}

export interface FeedbackData {
  sessionId: string;
  feedback: number;
  prompt: string;
  completion: string;
  topic: string;
  problem: string;
  comment: string;
  sources: string;
  documentIdentifier: string;
}
