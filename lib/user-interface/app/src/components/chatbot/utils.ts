import { ChatBotHistoryItem, ChatBotMessageType } from "./types";

function pairwise(arr: ChatBotHistoryItem[], func) {
  for (var i = 0; i < arr.length - 1; i++) {
    func(arr[i], arr[i + 1]);
  }
}

/**
 * Assembles the chat history into a format expected by the API
 */
export function assembleHistory(history: ChatBotHistoryItem[]) {
  var hist: Object[] = [];
  for (var i = 0; i < history.length - 1; i++) {
    if (history[i].type == ChatBotMessageType.Human) {
      hist.push({ "user": history[i].content, "chatbot": history[i+1].content, "metadata" : JSON.stringify(history[i+1].metadata)})
    }
  }   
  
  return hist;
}
