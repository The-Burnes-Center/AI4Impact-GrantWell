import { useEffect, useMemo, useState } from "react";
import { useApiClient } from "./use-api-client";
import { useDocumentLibrary } from "./use-document-library";
import { legacySelection } from "../common/helpers/user-documents";

type Stored = { keys: string[] | null; exists: boolean };

/** The user's library and which of its documents this chat's AI reads; ticking saves the full list. */
export function useChatDocuments(sessionId: string | undefined, documentIdentifier: string | null) {
  const apiClient = useApiClient();
  const library = useDocumentLibrary();
  const [stored, setStored] = useState<Stored | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiClient.sessions
      .getDocumentKeys(sessionId)
      .then(({ documentKeys, exists }) => {
        if (!cancelled) setStored({ keys: documentKeys, exists });
      })
      .catch((error) => {
        console.error("Error loading the chat's documents:", error);
        if (!cancelled) setStored({ keys: [], exists: false });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, sessionId]);

  const selected = useMemo(() => {
    if (!stored || library.loading) return null;
    const present = new Set(library.documents.map((d) => d.key));
    // A chat saved before the library has no selection and keeps reading its grant's old folder.
    const keys = stored.keys ?? (stored.exists ? legacySelection(library.documents, library.userId ?? "", documentIdentifier) : []);
    return keys.filter((k) => present.has(k));
  }, [stored, library.loading, library.documents, library.userId, documentIdentifier]);

  const change = async (keys: string[]) => {
    if (!sessionId) return;
    const previous = stored;
    setStored({ keys, exists: true });
    setSaveError(null);
    try {
      await apiClient.sessions.setDocumentKeys(sessionId, keys);
    } catch (error) {
      console.error("Error saving the chat's documents:", error);
      setStored(previous);
      setSaveError("Your choice couldn't be saved. Please try again.");
    }
  };

  return { library, selected, change, saveError };
}

export type ChatDocuments = ReturnType<typeof useChatDocuments>;
