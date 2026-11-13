import { useEffect, useState } from "react";
import { useApiClient } from "./use-api-client";

const known = new Map<string, Promise<boolean>>();

/** Whether the grant has a PDF to open: undefined until known, asked once per grant per page load. */
export function useGrantPdfAvailable(grant: string, enabled: boolean): boolean | undefined {
  const apiClient = useApiClient();
  const [available, setAvailable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !grant) return;
    let cancelled = false;
    let request = known.get(grant);
    if (!request) {
      request = apiClient.landingPage.getGrantPdf(grant).then((result) => result?.available === true);
      known.set(grant, request);
      request.catch(() => known.delete(grant));
    }
    request
      .then((value) => {
        if (!cancelled) setAvailable(value);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, grant, enabled]);

  return enabled && grant ? available : undefined;
}
