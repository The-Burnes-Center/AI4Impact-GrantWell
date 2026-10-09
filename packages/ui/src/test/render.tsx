import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppContext } from "../common/app-context";
import type { AppConfig } from "../common/types/app";
import { ApiClient } from "../common/api-client/api-client";
import { API } from "./fetch-routes";

export const testConfig: AppConfig = {
  Auth: {
    region: "us-east-1",
    userPoolId: "us-east-1_test",
    userPoolWebClientId: "client",
    oauth: { domain: "", scope: [], redirectSignIn: "", redirectSignOut: "", responseType: "code" },
  },
  httpEndpoint: API,
  wsEndpoint: "wss://ws.test",
  federatedSignInProvider: "",
};

export const testApiClient = () => new ApiClient(testConfig);

/** Renders inside the app's config context and a router, with a user-event instance. */
export function renderApp(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const user = userEvent.setup();
  const result = render(
    <AppContext.Provider value={testConfig}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AppContext.Provider>
  );
  return { user, ...result };
}
