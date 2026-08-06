import { useCallback, useEffect, useRef } from "react";
import { Auth } from "aws-amplify";
import { useDraftsClient } from "./use-drafts-client";
import { useAutoSave } from "./use-auto-save";
import { useNotifications } from "../components/notifications/NotificationManager";
import { Utils } from "../common/utils";
import {
  DraftConflictError,
  type DocumentDraft,
  type DraftStatus,
  type DraftWriteSource,
  type UploadedFileMeta,
} from "../common/api-client/drafts-client";
import { writeDraftCache } from "../common/helpers/document-editor-utils";
import type { ProjectBasicsData } from "../common/types/document";

export interface DraftSaveFields {
  title?: string;
  sections?: Record<string, string>;
  projectBasics?: ProjectBasicsData;
  questionnaire?: Record<string, string>;
  additionalInfo?: string;
  uploadedFiles?: UploadedFileMeta[];
  status?: DraftStatus;
}

type DraftPart = keyof DraftSaveFields;

interface SaveOptions {
  /** Section names this call changed; these win the merge on a 409. */
  changedSections?: string[];
  source?: DraftWriteSource;
  /** Skip the debounce and send now. */
  immediate?: boolean;
}

interface Snapshot extends DraftSaveFields {
  source: DraftWriteSource;
  dirtySections: string[];
  dirtyParts: DraftPart[];
}

interface UseDraftSaveOptions {
  sessionId: string | null | undefined;
  documentIdentifier: string | null | undefined;
  /** Used when the draft row has no title of its own yet. */
  fallbackTitle?: string;
  delay?: number;
  /** Mirror edits to the session cache and flush on tab close (default true). */
  persistOnExit?: boolean;
}

/**
 * The single read-modify-write path for a draft. Holds the last known server
 * state in a ref rather than re-reading before every write, and sends its `rev`
 * as `expected_rev` so a second writer gets a 409; on conflict it keeps the
 * sections it changed, takes the server's for the rest, and retries once.
 */
export function useDraftSave({
  sessionId,
  documentIdentifier,
  fallbackTitle,
  delay = 1000,
  persistOnExit = true,
}: UseDraftSaveOptions) {
  const draftsClient = useDraftsClient();
  const { addNotification } = useNotifications();

  const draftRef = useRef<DocumentDraft | null>(null);
  const userIdRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const dirtySectionsRef = useRef<Set<string>>(new Set());
  const dirtyPartsRef = useRef<Set<DraftPart>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        if (!cancelled) userIdRef.current = user.username;
        const token = await Utils.authenticate();
        if (!cancelled) authTokenRef.current = token;
      } catch (error) {
        console.error("Draft save could not resolve the current user:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cacheLocally = useCallback(
    (fields: DraftSaveFields) => {
      if (!sessionId) return;
      if (fields.sections) writeDraftCache(sessionId, "sections", fields.sections);
      if (fields.projectBasics) writeDraftCache(sessionId, "projectBasics", fields.projectBasics);
      if (fields.questionnaire) writeDraftCache(sessionId, "questionnaire", fields.questionnaire);
      if (fields.additionalInfo !== undefined) {
        writeDraftCache(sessionId, "additionalInfo", fields.additionalInfo);
      }
    },
    [sessionId]
  );

  const toDraft = useCallback(
    (snapshot: Snapshot, base: DocumentDraft | null): DocumentDraft => {
      const known = base ?? draftRef.current;
      return {
        sessionId: sessionId || "",
        userId: userIdRef.current || "",
        title: snapshot.title ?? known?.title ?? fallbackTitle ?? "",
        documentIdentifier: documentIdentifier || known?.documentIdentifier || "",
        sections: snapshot.sections ?? known?.sections ?? {},
        projectBasics: snapshot.projectBasics ?? known?.projectBasics ?? {},
        questionnaire: snapshot.questionnaire ?? known?.questionnaire ?? {},
        additionalInfo: snapshot.additionalInfo ?? known?.additionalInfo,
        uploadedFiles: snapshot.uploadedFiles ?? known?.uploadedFiles,
        status: snapshot.status ?? known?.status,
        lastModified: new Date().toISOString(),
        rev: known?.rev,
      };
    },
    [sessionId, documentIdentifier, fallbackTitle]
  );

  const mergeWithRemote = useCallback((remote: DocumentDraft, snapshot: Snapshot): DocumentDraft => {
    const local = draftRef.current;
    const merged: DocumentDraft = { ...remote };

    merged.sections = { ...(remote.sections || {}) };
    for (const name of snapshot.dirtySections) {
      const localSections = snapshot.sections ?? local?.sections;
      if (localSections && name in localSections) merged.sections[name] = localSections[name];
    }

    const mergedRecord = merged as unknown as Record<string, unknown>;
    const localRecord = (local ?? {}) as unknown as Record<string, unknown>;
    for (const part of snapshot.dirtyParts) {
      if (part === "sections") continue;
      const value = snapshot[part] ?? localRecord[part];
      if (value !== undefined) mergedRecord[part] = value;
    }

    return merged;
  }, []);

  const persist = useCallback(
    async (snapshot: Snapshot) => {
      if (!sessionId) return;
      if (!userIdRef.current) {
        userIdRef.current = (await Auth.currentAuthenticatedUser()).username;
      }
      // The exit path cannot await a token, so keep a recent one on hand.
      try {
        authTokenRef.current = await Utils.authenticate();
      } catch {
        /* the save below will surface auth failures */
      }

      const attempt = async (base: DocumentDraft | null, expectedRev?: number) =>
        draftsClient.updateDraft({
          ...toDraft(snapshot, base),
          expectedRev,
          writeSource: snapshot.source,
        });

      let saved: DocumentDraft;
      try {
        saved = await attempt(draftRef.current, draftRef.current?.rev);
      } catch (error) {
        if (!(error instanceof DraftConflictError)) throw error;

        const remote =
          error.remote ??
          (await draftsClient.getDraft({ sessionId, userId: userIdRef.current || "" }));
        if (!remote) throw error;

        const merged = mergeWithRemote(remote, snapshot);
        draftRef.current = merged;
        saved = await attempt(merged, remote.rev);
        addNotification(
          "info",
          "This draft was also edited in another tab or window. Your changes were merged with the newer version — please review the sections you were not editing."
        );
      }

      draftRef.current = {
        ...(draftRef.current ?? saved),
        rev: saved.rev,
        lastModified: saved.lastModified,
        status: saved.status ?? draftRef.current?.status,
      };

      for (const name of snapshot.dirtySections) dirtySectionsRef.current.delete(name);
      for (const part of snapshot.dirtyParts) dirtyPartsRef.current.delete(part);
    },
    [sessionId, draftsClient, toDraft, mergeWithRemote, addNotification]
  );

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const handleExitFlush = useCallback(
    (data: unknown) => {
      const snapshot = data as Snapshot;
      cacheLocally(snapshot);
      const token = authTokenRef.current;
      if (!token || !sessionId) return;
      draftsClient.saveDraftOnExit(
        {
          // Unconditional: last-write-wins beats losing the text entirely.
          ...toDraft(snapshot, draftRef.current),
          expectedRev: undefined,
          writeSource: snapshot.source,
        },
        token
      );
    },
    [cacheLocally, draftsClient, sessionId, toDraft]
  );

  // Destructured so saveFields keeps a stable identity across renders.
  const { triggerSave, flush, retry, saveStatus, isDirty, lastSavedAt, error } = useAutoSave({
    delay,
    onExitFlush: persistOnExit ? handleExitFlush : undefined,
  });

  const saveFields = useCallback(
    (fields: DraftSaveFields, options: SaveOptions = {}) => {
      const parts = Object.keys(fields) as DraftPart[];
      for (const part of parts) dirtyPartsRef.current.add(part);
      for (const name of options.changedSections || []) dirtySectionsRef.current.add(name);

      draftRef.current = { ...(draftRef.current as DocumentDraft), ...fields };
      cacheLocally(fields);

      const snapshot: Snapshot = {
        ...fields,
        sections: fields.sections ? { ...fields.sections } : undefined,
        source: options.source ?? "autosave",
        // Sorted so an unchanged payload serializes identically and the hook's
        // dirty check can skip the save.
        dirtySections: Array.from(dirtySectionsRef.current).sort(),
        dirtyParts: Array.from(dirtyPartsRef.current).sort(),
      };

      triggerSave(snapshot, (payload) => persistRef.current(payload as Snapshot));
      if (options.immediate) return flush();
      return Promise.resolve();
    },
    [triggerSave, flush, cacheLocally]
  );

  /** Seed the known server state after a load, marking nothing dirty. */
  const setBaseline = useCallback((draft: DocumentDraft | null) => {
    draftRef.current = draft;
    dirtySectionsRef.current = new Set();
    dirtyPartsRef.current = new Set();
  }, []);

  const getDraftSnapshot = useCallback(() => draftRef.current, []);

  return {
    saveFields,
    setBaseline,
    getDraftSnapshot,
    flush,
    retry,
    saveStatus,
    isDirty,
    lastSavedAt,
    error,
  };
}

export default useDraftSave;
