/** The `document` a grant citation names (chat and Requirements); a supporting document's citation names its file. */
export const GRANT_DOCUMENT = "Grant document";

/** "Bridge Grant" from a chat's "Bridge Grant/" or a Requirements identifier. */
export function grantNameOf(documentIdentifier: string | null | undefined): string {
  return (documentIdentifier ?? "").split("/").find(Boolean) ?? "";
}

/** The in-app page that opens the grant's PDF (at `page` when given) in the tab it is opened in. */
export function grantPdfHref(grant: string, page?: number): string {
  const params = new URLSearchParams({ grant });
  if (page && page > 0) params.set("page", String(page));
  return `/grant-pdf?${params.toString()}`;
}
