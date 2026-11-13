import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { usePageTitle } from "../../common/page-title";
import { useApiClient } from "../../hooks/use-api-client";

type State = "loading" | "text" | "missing" | "error";

/** Opens a grant's PDF in this tab (at `?page=`), through a short-lived link fetched when the page loads. */
export default function GrantPdfPage() {
  const apiClient = useApiClient();
  const [params] = useSearchParams();
  const grant = params.get("grant") ?? "";
  const page = Number(params.get("page"));
  const [state, setState] = useState<State>("loading");

  usePageTitle(state === "loading" ? "Opening the grant" : "Grant PDF not available");

  useEffect(() => {
    if (!grant) {
      setState("missing");
      return;
    }
    let cancelled = false;
    apiClient.landingPage
      .getGrantPdf(grant)
      .then((result) => {
        if (cancelled) return;
        if (result?.available && result.signedUrl) {
          window.location.replace(Number.isInteger(page) && page > 0 ? `${result.signedUrl}#page=${page}` : result.signedUrl);
        } else {
          setState(result ? "text" : "missing");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, grant, page]);

  const message = {
    loading: "",
    text: "This grant's document isn't a PDF, so it can't open here. Its requirements are on the Requirements page.",
    missing: "We couldn't find a PDF for this grant, or you don't have access to it.",
    error: "The grant couldn't be opened. Please try again.",
  }[state];

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "48px 16px", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "12px" }}>
        {state === "loading" ? "Opening the grant" : "Grant PDF not available"}
      </h1>
      <p role="status">{state === "loading" ? "Getting the grant's PDF…" : message}</p>
      {state !== "loading" && (
        <p>
          <Link
            to={state === "text" ? `/requirements/${encodeURIComponent(grant)}` : "/home"}
            style={{ color: "var(--gw-color-primary)", fontWeight: 600 }}
          >
            {state === "text" ? "Go to the grant's requirements" : "Find grants on the home page"}
          </Link>
        </p>
      )}
    </div>
  );
}
