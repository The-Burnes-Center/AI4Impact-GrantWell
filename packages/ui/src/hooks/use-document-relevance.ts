import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "./use-api-client";
import { relevanceMessage, type DocumentRelevance } from "../common/helpers/user-documents";

/**
 * Whether each selected document relates to the grant, checked as it is ticked. The server checks
 * a document once per version and grant, and its loaders skip any that aren't usable, so this only
 * shows what will happen. `announcement` is meant for one polite live region (RelevanceLiveRegion).
 */
export function useDocumentRelevance(
  documentIdentifier: string | null | undefined,
  selectedKeys: string[] | null,
  names: Record<string, string> = {}
) {
  const apiClient = useApiClient();
  const [statuses, setStatuses] = useState<Record<string, DocumentRelevance>>({});
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const asked = useRef(new Set<string>());
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    asked.current = new Set();
    setStatuses({});
  }, [documentIdentifier]);

  const check = useCallback(
    async (keys: string[]) => {
      if (!documentIdentifier || keys.length === 0) return;
      setChecking((prev) => new Set([...prev, ...keys]));
      let results: DocumentRelevance[];
      try {
        results = await apiClient.userDocuments.getRelevance(documentIdentifier, keys);
      } catch {
        results = keys.map((key) => ({ key, status: "check-failed", usable: false }));
      }
      setStatuses((prev) => ({ ...prev, ...Object.fromEntries(results.map((r) => [r.key, r])) }));
      setChecking((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
      const said = results
        .map((r) => {
          const message = relevanceMessage(r);
          return message ? `${namesRef.current[r.key] ?? "A document"}: ${message.title}` : null;
        })
        .filter(Boolean);
      if (said.length) setAnnouncement(said.join(". "));
    },
    [apiClient, documentIdentifier]
  );

  useEffect(() => {
    if (!documentIdentifier || !selectedKeys) return;
    const fresh = selectedKeys.filter((k) => !asked.current.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => asked.current.add(k));
    void check(fresh);
  }, [documentIdentifier, selectedKeys, check]);

  const retry = useCallback((key: string) => check([key]), [check]);

  /** Throws with a message for the user when the request isn't accepted. */
  const requestReview = useCallback(
    async (key: string, note: string) => {
      if (!documentIdentifier) return;
      const updated = await apiClient.userDocuments.requestRelevanceReview(documentIdentifier, key, note);
      setStatuses((prev) => ({ ...prev, [key]: updated }));
      setAnnouncement(`${namesRef.current[key] ?? "The document"}: request sent to an admin.`);
    },
    [apiClient, documentIdentifier]
  );

  return { statuses, checking, announcement, retry, requestReview };
}

export type DocumentRelevanceState = ReturnType<typeof useDocumentRelevance>;
