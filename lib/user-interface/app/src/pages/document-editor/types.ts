// Interface definitions for document editor components

import React from "react";

// DocumentSection represents a single section in a document
export interface SectionData {
  id: string;
  title: string;
  content: string;
  isComplete: boolean;
}

// For backward compatibility
export type DocumentSection = SectionData;

// Document represents the overall document structure
export interface DocumentData {
  title: string;
  sections: SectionData[];
}

// For backward compatibility
export type Document = DocumentData;

// ChatMessage represents a single message in the chat
export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "bot";
  content: string;
  timestamp?: number;
}

// Props for the AssistantPanel component
export interface AssistantPanelProps {
  activeSection: SectionData | null;
  chatMessages: ChatMessage[];
  isSending: boolean;
  messageInput: string;
  setMessageInput: (input: string) => void;
  handleSendMessage: () => void;
}

// Props for the DocumentEditorPanel component
export interface DocumentEditorPanelProps {
  activeSection: SectionData | null;
  handleSectionContentChange: (content: string) => void;
  handleGenerateContent: () => void;
  isGenerating: boolean;
  getSectionDescriptionText: () => string;
}

// Props for the SectionsPanel component
export interface SectionsPanelProps {
  sections: SectionData[];
  activeSection: string;
  onSectionChange: (id: string) => void;
}

// Props for the main DocumentEditor component
export interface DocumentEditorProps {
  documentId?: string;
  projectId?: string;
}
