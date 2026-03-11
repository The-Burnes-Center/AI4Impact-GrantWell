import { useContext, useMemo } from "react";
import { AppContext } from "../common/app-context";
import { DraftsClient } from "../common/api-client/drafts-client";

/**
 * Returns a memoized DraftsClient instance scoped to the current AppContext.
 *
 * Use this instead of `new DraftsClient(appContext)` inside components to
 * avoid re-creating the client on every render.
 */
export function useDraftsClient(): DraftsClient {
  const appContext = useContext(AppContext);
  return useMemo(() => new DraftsClient(appContext), [appContext]);
}

export default useDraftsClient;
