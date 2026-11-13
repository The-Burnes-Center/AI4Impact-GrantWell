/**
 * The document library: every file a user uploaded, under "<userId>/". New uploads go to
 * "<userId>/documents/"; files uploaded before the library sit in "<userId>/<grant name>/"
 * (some as "<grant name>//<file>") and stay there.
 *
 * The byte caps mirror DEFAULT_LIMITS in the core's supporting-documents.mjs, which makes the
 * final call; page counts and extracted text length are only known there.
 */

export interface LibraryDocument {
  key: string;
  name: string;
  /** "documents" for library uploads, else the grant an older upload was filed under. */
  folder: string;
  size: number;
  lastModified: string;
  /** null for files uploaded before types existed. */
  type?: DocumentType | null;
  /** Only for type "other". */
  description?: string;
}

export const LIBRARY_FOLDER = "documents";

/** Mirrors DOCUMENT_TYPES in the core's document-relevance.mjs. */
export const DOCUMENT_TYPES = [
  { value: "budget", label: "Budget" },
  { value: "organization-profile", label: "Organization profile" },
  { value: "letter-of-support", label: "Letter of support" },
  { value: "past-application", label: "Past application" },
  { value: "data-or-needs", label: "Data or needs assessment" },
  { value: "other", label: "Other" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

export const MAX_TYPE_DESCRIPTION_CHARS = 200;

export interface DocumentTypeChoice {
  type: DocumentType | "";
  description: string;
}

/** "Budget", "Other: board minutes", or "Type not set". */
export function documentTypeLabel(doc: { type?: string | null; description?: string }): string {
  const found = DOCUMENT_TYPES.find((t) => t.value === doc.type);
  if (!found) return "Type not set";
  return found.value === "other" && doc.description ? `Other: ${doc.description}` : found.label;
}

/** What's wrong with a type choice, field by field; empty when it can be saved. */
export function documentTypeErrors(choice: DocumentTypeChoice): { type?: string; description?: string } {
  if (!choice.type) return { type: "Choose a document type." };
  if (choice.type !== "other") return {};
  const text = choice.description.trim();
  if (!text) return { description: "Describe the document in a few words." };
  if (text.length > MAX_TYPE_DESCRIPTION_CHARS) return { description: `Keep the description to ${MAX_TYPE_DESCRIPTION_CHARS} characters.` };
  return {};
}

/** One document's standing for one grant, as POST /user-documents/relevance reports it. */
export type RelevanceStatus =
  | "related"
  | "approved"
  | "unrelated"
  | "review-pending"
  | "rejected"
  | "check-failed"
  | "not-checked"
  | "unsupported";

export interface DocumentRelevance {
  key: string;
  status: RelevanceStatus;
  /** Whether the AI uses the document for this grant. */
  usable: boolean;
  /** The check's one-line reason. */
  reason?: string;
  checkedAt?: string;
  review?: {
    status: "pending" | "approved" | "rejected";
    note?: string;
    requestedAt: string;
    adminNote?: string;
    decidedAt?: string;
  };
}

export const MAX_REVIEW_NOTE_CHARS = 500;

export interface RelevanceMessage {
  tone: "success" | "warning" | "info";
  title: string;
  detail?: string;
  /** What the user can do next. */
  actions?: ("retry" | "request-review")[];
}

/** What to tell the user about a document's standing for the grant; null when there's nothing to say. */
export function relevanceMessage(r: DocumentRelevance | undefined): RelevanceMessage | null {
  switch (r?.status) {
    case "approved":
      return { tone: "success", title: "Approved by an admin for this grant" };
    case "unrelated":
      return {
        tone: "warning",
        title: "Not used: doesn't look related to this grant",
        detail: r.reason,
        actions: ["request-review"],
      };
    case "review-pending":
      return { tone: "info", title: "Not used yet: an admin is reviewing your request", detail: r.reason };
    case "rejected":
      return {
        tone: "warning",
        title: "Not used: an admin agreed it doesn't relate to this grant",
        detail: r.review?.adminNote ? `Admin's note: ${r.review.adminNote}` : undefined,
      };
    case "check-failed":
      return { tone: "warning", title: "Couldn't check this document yet, try again", actions: ["retry", "request-review"] };
    case "not-checked":
      return { tone: "warning", title: "Couldn't check this document yet, try again", actions: ["retry"] };
    default:
      return null;
  }
}

export const libraryKey = (userId: string, fileName: string) => `${userId}/${LIBRARY_FOLDER}/${fileName}`;

export function grantFolderName(documentIdentifier: string | null | undefined): string {
  return String(documentIdentifier ?? "").replace(/\/+$/, "").split("/").pop() || "";
}

/**
 * What a chat or application reads when it never stored a selection: everything uploaded
 * for its grant before the library existed.
 */
export function legacySelection(
  library: LibraryDocument[],
  userId: string,
  documentIdentifier: string | null | undefined
): string[] {
  const grant = grantFolderName(documentIdentifier);
  if (!userId || !grant) return [];
  const prefix = `${userId}/${grant}/`;
  return library.filter((d) => d.key.startsWith(prefix)).map((d) => d.key);
}

export const UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "html", "json", "xml", "md",
  "rtf", "epub", "odt", "tsv", "eml", "msg",
];

export const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  xml: "application/xml",
  md: "text/markdown",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  odt: "application/vnd.oasis.opendocument.text",
  tsv: "text/tab-separated-values",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

// Must match the server cap in generate-upload-url/index.mjs.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** Why a file can't be uploaded, or null. */
export function uploadProblem(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (!UPLOAD_EXTENSIONS.includes(ext)) return `${file.name}: unsupported file type (.${ext || "unknown"})`;
  if (file.size === 0) return `${file.name} is empty (0 bytes), so there is nothing to upload`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name}: exceeds the 100 MB limit`;
  return null;
}

const AI_TEXT_EXTENSIONS = ["txt", "csv", "tsv", "md", "html", "json", "xml", "rtf"];
const MAX_AI_PDF_BYTES = 20 * 1024 * 1024;
const MAX_AI_TEXT_CHARS = 200_000;
const MAX_AI_FILES = 25;

/** The reasons the AI skips a file, as the core reports them. */
export const SKIP_REASON_TEXT: Record<string, string> = {
  unsupported: "The AI can't read this file type",
  "too-large": "Too large for the AI to read",
  "over-budget": "Skipped: the other selected files use up what the AI can read at once",
  unreadable: "The AI couldn't open this file",
  "not-related": "Not used: doesn't look related to this grant",
  "not-checked": "Couldn't check this document yet, try again",
};

/**
 * For each selected document the AI will skip, the reason, as far as sizes and types tell.
 * Applies the core's order: newest first, PDFs against one byte budget.
 */
export function readingNotes(selected: LibraryDocument[]): Record<string, string> {
  const notes: Record<string, string> = {};
  let pdfBytes = 0;
  const newestFirst = [...selected].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime() || a.key.localeCompare(b.key)
  );
  newestFirst.forEach((doc, index) => {
    const ext = extensionOf(doc.name);
    if (ext !== "pdf" && ext !== "docx" && !AI_TEXT_EXTENSIONS.includes(ext)) {
      notes[doc.key] = SKIP_REASON_TEXT.unsupported;
    } else if (index >= MAX_AI_FILES) {
      notes[doc.key] = SKIP_REASON_TEXT["over-budget"];
    } else if (ext === "pdf") {
      if (doc.size > MAX_AI_PDF_BYTES) notes[doc.key] = SKIP_REASON_TEXT["too-large"];
      else if (pdfBytes + doc.size > MAX_AI_PDF_BYTES) notes[doc.key] = SKIP_REASON_TEXT["over-budget"];
      else pdfBytes += doc.size;
    } else if (ext !== "docx" && doc.size > MAX_AI_TEXT_CHARS * 4) {
      notes[doc.key] = SKIP_REASON_TEXT["too-large"];
    }
  });
  return notes;
}

/** A note the AI can't use a file at all, shown whether or not it is ticked. */
export function unreadableType(doc: LibraryDocument): string | null {
  const ext = extensionOf(doc.name);
  return ext === "pdf" || ext === "docx" || AI_TEXT_EXTENSIONS.includes(ext) ? null : SKIP_REASON_TEXT.unsupported;
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
