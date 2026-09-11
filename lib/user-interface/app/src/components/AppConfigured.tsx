import { useEffect, useState } from "react";
import {
  ThemeProvider,
  defaultDarkModeOverride,
} from "@aws-amplify/ui-react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import { getCurrentUser } from "aws-amplify/auth";
import { Alert, Spinner } from "react-bootstrap";
import App from "../App";
import { AppConfig } from "../common/types/app";
import { AppContext } from "../common/app-context";
import { BrandingProvider, useBranding } from "../common/branding";
import { activeBranding } from "../../config/active-instance";
import { StorageHelper } from "../common/helpers/storage-helper";
import MaintenanceGate from "./MaintenanceGate";
import ProfileGate from "./profile-gate/ProfileGate";
import LandingPage from "../pages/landing/LandingPage";
import LoginPage from "../pages/landing/LoginPage";
import {
  AppNavbar,
  LandingFooter,
  OmniHeader,
} from "@chrome";
import "../styles/marketing-landing.css";

async function getInitialAuthState() {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

function toResourcesConfig(awsExports: AppConfig) {
  const { userPoolId, userPoolWebClientId, oauth } = awsExports.Auth;

  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: userPoolWebClientId,
        loginWith: oauth?.domain
          ? {
              oauth: {
                domain: oauth.domain,
                scopes: oauth.scope,
                redirectSignIn: [oauth.redirectSignIn],
                redirectSignOut: [oauth.redirectSignOut],
                responseType: oauth.responseType as "code" | "token",
              },
            }
          : undefined,
      },
    },
  };
}

function UnauthenticatedPageTitle(): null {
  const { pathname } = useLocation();
  const { appName } = useBranding();

  useEffect(() => {
    document.title =
      pathname === "/login" ? `Sign In - ${appName}` : `${appName} - Home`;
  }, [pathname, appName]);

  return null;
}

export default function AppConfigured() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [theme, setTheme] = useState(StorageHelper.getTheme());
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadConfiguration = async () => {
      try {
        const result = await fetch("/aws-exports.json");
        if (!result.ok) {
          throw new Error(`Failed to load auth configuration: ${result.status}`);
        }

        const awsExports = (await result.json()) as AppConfig;
        awsExports.httpEndpoint = awsExports.httpEndpoint.replace(/\/+$/, "");
        Amplify.configure(toResourcesConfig(awsExports));

        const isAuthenticated = await getInitialAuthState();
        if (cancelled) return;

        setConfig(awsExports);
        setAuthenticated(isAuthenticated);
      } catch (configError) {
        if (cancelled) return;

        console.error("Configuration error:", configError);
        setError(true);
      } finally {
        if (!cancelled) {
          setConfigured(true);
        }
      }
    };

    loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "tokenRefresh":
          setAuthenticated(true);
          break;
        case "signedOut":
          setAuthenticated(false);
          if (window.location.pathname !== "/") {
            window.location.href = "/";
          }
          break;
        case "tokenRefresh_failure":
        case "signInWithRedirect_failure":
          setAuthenticated(false);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const newValue = document.documentElement.style.getPropertyValue(
            "--app-color-scheme",
          );
          const mode = newValue === "dark" ? "dark" : "light";

          if (mode !== theme) {
            setTheme(mode);
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => {
      observer.disconnect();
    };
  }, [theme]);

  if (!config) {
    if (error) {
      return (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Alert variant="danger">
            <Alert.Heading>Configuration error</Alert.Heading>
            Error loading configuration from{" "}
            <a href="/aws-exports.json" style={{ fontWeight: "600" }}>
              /aws-exports.json
            </a>
          </Alert>
        </div>
      );
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>Loading</span>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={config}>
      <BrandingProvider value={activeBranding}>
        <ThemeProvider
          theme={{
            name: "default-theme",
            overrides: [defaultDarkModeOverride],
          }}
          colorMode={theme === "dark" ? "dark" : "light"}
        >
          <BrowserRouter>
            <AppLayoutContent
              authenticated={authenticated}
              configured={configured}
              onAuthenticated={() => setAuthenticated(true)}
            />
          </BrowserRouter>
        </ThemeProvider>
      </BrandingProvider>
    </AppContext.Provider>
  );
}

function AppLayoutContent({
  authenticated,
  configured,
  onAuthenticated,
}: {
  authenticated: boolean | null;
  configured: boolean;
  onAuthenticated: () => void;
}) {
  if (authenticated) {
    return (
      <div className="marketing marketing__app-shell">
        <OmniHeader />
        <AppNavbar />
        <div className="marketing__app-main">
          <ProfileGate>
            <MaintenanceGate>
              <App />
            </MaintenanceGate>
          </ProfileGate>
        </div>
        <LandingFooter />
        <OmniHeader position="bottom" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <Spinner animation="border" size="sm" aria-hidden="true" />
        <span>Loading</span>
      </div>
    );
  }

  return (
    <>
      <UnauthenticatedPageTitle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={<LoginPage onAuthenticated={onAuthenticated} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
