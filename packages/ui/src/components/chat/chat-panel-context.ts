import { createContext, useContext } from "react";
import type { ChatCitation } from "./types";

/** One answer's sources, for the Grant panel's Sources tab. */
export interface PanelAnswer {
  reply: number;
  question: string;
  citations: ChatCitation[];
  sources: Array<{ title: string; uri: string }>;
}

export interface ChatPanelApi {
  /** True while the Grant panel is on screen beside the chat, so citation numbers open it instead of a popover. */
  citationsInPanel: boolean;
  showSource: (reply: number, citation: number) => void;
  setAnswers: (answers: PanelAnswer[]) => void;
}

export const ChatPanelContext = createContext<ChatPanelApi | null>(null);

/** The answer the Sources tab shows: the one picked, else the newest that has sources. */
export function panelAnswer(answers: PanelAnswer[], selectedReply: number | null): PanelAnswer | null {
  const picked = selectedReply !== null ? answers.find((a) => a.reply === selectedReply) : undefined;
  if (picked) return picked;
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].citations.length || answers[i].sources.length) return answers[i];
  }
  return null;
}

export const useChatPanel = () => useContext(ChatPanelContext);
