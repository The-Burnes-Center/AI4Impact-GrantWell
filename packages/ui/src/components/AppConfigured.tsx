import { Suspense, lazy, useEffect, useState } from "react";
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
import { isEndingSession, setSignedIn } from "../common/session-ended";
import { getCurrentUser } from "aws-amplify/auth";
import { Alert, Spinner } from "react-bootstrap";
import App from "../App";
import { AppConfig } from "../common/types/app";
import { AppContext } from "../common/app-context";
import { BrandingProvider, useBranding } from "../common/branding";
import { activeBranding, IS_PROD, SEO_TITLE } from "../common/instance";
import { StorageHelper } from "../common/helpers/storage-helper";
import MaintenanceGate from "./MaintenanceGate";
import { NavigationProvider } from "./navigation/NavigationProvider";
import { AppSidebar } from "./navigation/UnifiedNavigation";
import ProfileGate from "./profile-gate/ProfileGate";
import MfaGate from "./auth/MfaGate";
import SignInNotices from "./SignInNotices";
import LandingPage from "../pages/landing/LandingPage";
import LoginPage from "../pages/landing/LoginPage";
import {
  AppNavbar,
  OmniHeader,
} from "../pages/landing/chrome";
import "../styles/marketing-landing.css";
import { AppSiteHeader, SiteBanner, SiteFooter } from "./common/ChromeSlots";
import { CHROME } from "../common/chrome";
import PublicHomePage from "../pages/landing/PublicHomePage";

const WhatsNewPage = lazy(() => import("../pages/whats-new/WhatsNewPage"));

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

function UnauthenticatedRouteEffects(): null {
  const { pathname, hash } = useLocation();
  const { appName } = useBranding();

  useEffect(() => {
    document.title = pathname === "/login" ? `Sign in - ${appName}` : SEO_TITLE;
  }, [pathname, appName]);

  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

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
    setSignedIn(authenticated === true);
  }, [authenticated]);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "tokenRefresh":
          setAuthenticated(true);
          break;
        case "signedOut":
          setAuthenticated(false);
          if (!isEndingSession() && window.location.pathname !== "/") {
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

  // The page's static fallback already shows the landing; keep it on screen instead of a spinner.
  // A deployment's own public home needs the config for its sign-in panel, so it waits instead.
  if (!config && !error && window.location.pathname === "/" && !CHROME.PublicHome) {
    return (
      <BrandingProvider value={activeBranding}>
        <BrowserRouter>
          <LandingPage />
        </BrowserRouter>
      </BrandingProvider>
    );
  }

  if (!config) {
    // One region across both boot states, so the swap to the failure message is an
    // update to a region the screen reader is already watching.
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
        <div role="status" aria-live="polite" className="visually-hidden">
          {error ? "Configuration error" : "Loading"}
        </div>
        {error ? (
          <Alert variant="danger" transition={false} role={undefined}>
            <Alert.Heading>Configuration error</Alert.Heading>
            Error loading configuration from{" "}
            <a href="/aws-exports.json" style={{ fontWeight: "600" }}>
              /aws-exports.json
            </a>
          </Alert>
        ) : (
          <div
            aria-hidden="true"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Spinner animation="border" size="sm" />
            <span>Loading</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppContext.Provider value={config}>
      <BrandingProvider value={activeBranding} analytics={IS_PROD}>
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
  const { pathname } = useLocation();

  if (authenticated) {
    return (
      <NavigationProvider>
        <div className="marketing marketing__app-shell">
          <SiteBanner />
          <AppSiteHeader />
          <AppNavbar />
          <div className="marketing__app-body">
            <AppSidebar />
            <div className="marketing__app-main">
              <MfaGate>
                <ProfileGate>
                  <MaintenanceGate>
                    <SignInNotices />
                    <App />
                  </MaintenanceGate>
                </ProfileGate>
              </MfaGate>
            </div>
          </div>
          <SiteFooter signedIn />
          <OmniHeader position="bottom" />
        </div>
      </NavigationProvider>
    );
  }

  if (!configured && pathname === "/" && !CHROME.PublicHome) {
    return <LandingPage />;
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
      <UnauthenticatedRouteEffects />
      <Routes>
        <Route
          path="/"
          element={CHROME.PublicHome ? <PublicHomePage onAuthenticated={onAuthenticated} /> : <LandingPage />}
        />
        <Route
          path="/login"
          element={
            CHROME.PublicHome ? <PublicHomePage onAuthenticated={onAuthenticated} /> : <LoginPage onAuthenticated={onAuthenticated} />
          }
        />
        <Route
          path="/whats-new"
          element={
            <Suspense fallback={null}>
              <WhatsNewPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
