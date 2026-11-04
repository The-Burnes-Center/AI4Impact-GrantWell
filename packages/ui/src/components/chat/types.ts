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

/** A quoted passage the answer cites; `at` holds offsets in the answer text where its marker goes. */
export interface ChatCitation {
  n: number;
  at: number[];
  quote: string;
  document: string;
  page?: number;
  lastPage?: number;
}

export interface ChatBotHistoryItem {
  type: ChatBotMessageType;
  content: string;
  metadata: Record<
    string,
    | string
    | boolean
    | number
    | null
    | undefined
    | string[]
    | string[][]
    | Array<{ title: string; uri: string }>
    | ChatCitation[]
  >;
}
