import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import ReviewApplication from "./ReviewApplication";

const GRANT = { data: { GrantName: "Grant A", ProjectNarrativeSections: [{ item: "Budget", description: "Costs." }] } };

function renderReview(grantType: string | null) {
  const net = stubFetch({
    "GET /s3-nofo-summary": json(GRANT),
    "GET /s3-nofo-bucket-data": json({ nofoData: [{ name: "Grant A", grant_type: grantType }] }),
    "POST /user-draft": json({ session_id: "s1", sections: { Budget: "We need $10." }, status: "reviewing" }),
  });
  renderApp(<ReviewApplication selectedNofo="Grant A" sessionId="s1" onNavigate={() => {}} />);
  return net;
}

async function grantTypeLoaded(net: ReturnType<typeof stubFetch>) {
  await vi.waitFor(() => expect(net.to("GET /s3-nofo-bucket-data")).toHaveLength(1));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe("ReviewApplication after-export steps", () => {
  it("points a federal grant at grants.gov and the SF-424", async () => {
    await grantTypeLoaded(renderReview("federal"));
    expect(await screen.findByText("Submit the PDF through the official grants.gov portal")).toBeInTheDocument();
    expect(screen.getByText("Complete the SF-424 form separately (if required)")).toBeInTheDocument();
  });

  it.each(["state", "quasi", "philanthropic"])("points a %s grant at the funder's own process", async (type) => {
    await grantTypeLoaded(renderReview(type));
    expect(await screen.findByText(/Submit it through the funder's own application portal or process/)).toBeInTheDocument();
    expect(screen.getByText(/Key deadlines/)).toBeInTheDocument();
    expect(screen.queryByText(/grants\.gov/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SF-424/)).not.toBeInTheDocument();
  });
});
