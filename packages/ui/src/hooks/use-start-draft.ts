import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "aws-amplify/auth";
import { useDraftsClient } from "./use-drafts-client";
import { clearDraftCache } from "../common/helpers/document-editor-utils";
import { Utils } from "../common/utils";

/** Creates an empty draft for a NOFO and returns the editor URL for its first step. */
export function useStartDraft(): (nofo: string) => Promise<string> {
  const draftsClient = useDraftsClient();

  return useCallback(async (nofo: string) => {
    const newSessionId = uuidv4();
    const username = (await getCurrentUser()).username;
    if (username) {
      await draftsClient.createDraft({
        sessionId: newSessionId, userId: username,
        title: `Application for ${nofo}`, documentIdentifier: nofo,
        sections: {}, projectBasics: {}, questionnaire: {},
        status: "project_basics", reachedSteps: ["projectBasics"],
        lastModified: Utils.getCurrentTimestamp(),
      });
    }
    clearDraftCache(newSessionId);
    return `/document-editor/${newSessionId}?step=projectBasics&grant=${encodeURIComponent(nofo)}`;
  }, [draftsClient]);
}

export default useStartDraft;
