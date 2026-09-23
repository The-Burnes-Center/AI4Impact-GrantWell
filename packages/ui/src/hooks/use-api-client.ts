import { useContext, useMemo } from "react";
import { AppContext } from "../common/app-context";
import { ApiClient } from "../common/api-client/api-client";

/**
 * Returns a memoized ApiClient instance scoped to the current AppContext.
 *
 * Use this instead of `new ApiClient(appContext)` inside components to
 * avoid re-creating the client on every render.
 */
export function useApiClient(): ApiClient {
  const appContext = useContext(AppContext);
  return useMemo(() => new ApiClient(appContext), [appContext]);
}

export default useApiClient;
