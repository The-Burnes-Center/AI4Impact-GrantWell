import { ChatBotHistoryItem, ChatBotMessageType } from "./types";

type ChatMetadata = ChatBotHistoryItem["metadata"];

function pairwise(arr: ChatBotHistoryItem[], func: (a: ChatBotHistoryItem, b: ChatBotHistoryItem) => void) {
  for (let i = 0; i < arr.length - 1; i++) {
    func(arr[i], arr[i + 1]);
  }
}

/**
 * Assembles the chat history into a format expected by the API
 */
export function assembleHistory(history: ChatBotHistoryItem[]) {
  const hist: Array<{ user: string; chatbot: string; metadata: string }> = [];
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].type == ChatBotMessageType.Human) {
      hist.push({ "user": history[i].content, "chatbot": history[i+1].content, "metadata" : JSON.stringify(history[i+1].metadata)})
    }
  }   
  
  return hist;
}

/**
 * Converts backend chat history format to frontend format
 * Backend format: [{ user: "message", chatbot: "response", metadata: "..." }]
 * Frontend format: [{ type: "Human", content: "...", metadata: {} }, { type: "AI", content: "...", metadata: {...} }]
 */
export function parseChatHistory(backendHistory: Array<Record<string, unknown>>): ChatBotHistoryItem[] {
  if (!backendHistory || !Array.isArray(backendHistory)) {
    return [];
  }

  const frontendHistory: ChatBotHistoryItem[] = [];

  for (const entry of backendHistory) {
    // Handle both old format (user/chatbot) and new format (type/content)
    if (entry.user !== undefined && entry.chatbot !== undefined) {
      // Backend format: { user: "...", chatbot: "...", metadata: "..." }
      // Handle case where user is empty string (initial greeting)
      const isEmptyUser = entry.user === "";
      
      let metadata: ChatMetadata = {};
      try {
        // Metadata might be a string or already an object
        if (typeof entry.metadata === 'string') {
          const parsed = JSON.parse(entry.metadata);
          // If parsed result is an array, wrap it in Sources object (for compatibility with ChatMessage component)
          if (Array.isArray(parsed)) {
            metadata = { Sources: parsed } as ChatMetadata;
          } else {
            metadata = parsed as ChatMetadata;
          }
        } else if (entry.metadata) {
          // If it's already an object but has an array at root, wrap it
          if (Array.isArray(entry.metadata)) {
            metadata = { Sources: entry.metadata } as ChatMetadata;
          } else {
            metadata = entry.metadata as ChatMetadata;
          }
        }
      } catch (e) {
        console.warn('Failed to parse metadata:', e);
        metadata = {};
      }

      // Only add user message if it's not empty (for initial greetings)
      if (!isEmptyUser) {
        frontendHistory.push({
          type: ChatBotMessageType.Human,
          content: String(entry.user),
          metadata: {},
        });
      }

      frontendHistory.push({
        type: ChatBotMessageType.AI,
        content: String(entry.chatbot),
        metadata: metadata,
      });
    } else if (entry.type && entry.content) {
      // Already in frontend format, just ensure metadata is an object
      let metadata: ChatMetadata = (entry.metadata || {}) as ChatMetadata;
      
      // Ensure Sources array is properly formatted if metadata exists
      if (metadata && typeof metadata === 'object' && !('Sources' in metadata) && Array.isArray(metadata)) {
        metadata = { Sources: metadata } as ChatMetadata;
      }
      
      frontendHistory.push({
        type: entry.type as ChatBotMessageType,
        content: String(entry.content),
        metadata: metadata,
      });
    }
  }

  return frontendHistory;
}
