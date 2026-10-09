import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { testConfig } from "../../test/render";
import { UserManagementClient } from "./user-management-client";

const USERS = "GET /user-management/users";
const client = () => new UserManagementClient(testConfig);

describe("UserManagementClient.listUsers", () => {
  it("sends the page size, token and trimmed query with the bearer token", async () => {
    const net = stubFetch({ [USERS]: json({ users: [], nextPaginationToken: null, pageSize: 25 }) });
    await client().listUsers({ limit: 25, paginationToken: "tok", query: "  ann " });
    const { url, headers } = net.to(USERS)[0];
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "25", paginationToken: "tok", query: "ann" });
    expect(headers.get("Authorization")).toBe("Bearer test-id-token");
  });

  it("throws the server's message on a JSON error", async () => {
    stubFetch({ [USERS]: json({ message: "Only admins can list users" }, 403) });
    await expect(client().listUsers()).rejects.toThrow("Only admins can list users");
  });

  it("throws the status, not a JSON parse error, when a gateway answers with HTML", async () => {
    stubFetch({
      [USERS]: new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    });
    await expect(client().listUsers()).rejects.toThrow("Request failed (HTTP 502)");
  });
});
