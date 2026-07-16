import React, { Suspense, useEffect, useRef } from "react";
import {
  Outlet,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { NotificationProvider } from "./components/notifications/NotificationManager";
import NotificationBar from "./components/notifications/NotificationBar";
import { AccessDeniedProvider } from "./components/access-denied/AccessDeniedManager";
import { useBranding } from "./common/branding";
import "./styles/app.scss";

const Playground = React.lazy(() => import("./pages/chat/playground/PlaygroundPage"));
const SessionPage = React.lazy(() => import("./pages/chat/sessions/SessionsPage"));
const HomePage = React.lazy(() => import("./pages/home/HomePage"));
const Checklists = React.lazy(() => import("./pages/requirements/ChecklistPage"));
const DocumentEditor = React.lazy(() => import("./pages/document-editor/DocumentEditorPage"));
const DocEditorSessionsPage = React.lazy(() => import("./pages/document-editor/DocEditorSessionsPage"));
const Dashboard = React.lazy(() => import("./pages/dashboard/DashboardPage"));

function ScrollToTop(): null {
  const { pathname, search } = useLocation();
  const prevPathRef = useRef<string>("");
  const { appName, analyticsId } = useBranding();

  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.focus({ preventScroll: true });
    }

    // Page label per route; the app name is appended from branding.
    const getPageLabel = (path: string): string | null => {
      const exactMatches: { [key: string]: string } = {
        "/": "Home",
        "/home": "Home",
        "/admin/dashboard": "Admin Dashboard",
        "/chat/sessions": "Chat Sessions",
        "/document-editor": "Document Editor",
        "/document-editor/drafts": "Document Editor Drafts",
      };

      if (exactMatches[path]) {
        return exactMatches[path];
      }

      if (path.startsWith("/chat/") && path !== "/chat/sessions") {
        return "Chatbot Playground";
      }
      if (path.startsWith("/document-editor/") && path !== "/document-editor/drafts") {
        return "Document Editor Session";
      }
      if (path.startsWith("/requirements/")) {
        return "Requirements Checklist";
      }

      return null;
    };

    const label = getPageLabel(pathname);
    const home = pathname === "/" || pathname === "/home";
    const baseTitle = !label
      ? appName
      : home
      ? `${appName} - ${label}`
      : `${label} - ${appName}`;
    document.title = baseTitle;

    const fullPath = pathname + search;
    const fullUrl = window.location.origin + fullPath;
    
    if (prevPathRef.current !== fullPath) {
      prevPathRef.current = fullPath;
      
      const environment = typeof window !== "undefined" && window.__ENVIRONMENT__ 
        ? window.__ENVIRONMENT__ 
        : 'staging';
      const isProduction = environment === 'production';
      
      if (isProduction && analyticsId && typeof window !== "undefined" && window.gtag) {
        window.gtag("config", analyticsId, {
          page_title: baseTitle,
          page_path: fullPath,
          page_location: fullUrl,
        });
      }
    }
  }, [pathname, search, appName, analyticsId]);

  return null;
}

function App() {
  return <AppContent />;
}

function AppContent() {
  return (
    <NotificationProvider>
      <AccessDeniedProvider>
      <ScrollToTop />
      {/* Brand Banner, Header, and Footer are now rendered globally in AppConfigured */}
      <main id="main-content" tabIndex={-1}>
        <NotificationBar />
        <ErrorBoundary>
          <Suspense fallback={<div className="lazy-loading-fallback" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>Loading...</div>}>
            <Routes>
            <Route
              index
              path="/"
              element={<Navigate to={`/home`} replace />}
            />
            <Route path="/home" element={<HomePage />} />
            <Route
              path="/requirements/:documentIdentifier"
              element={<Checklists />}
            />
            <Route path="/chat/:sessionId" element={<Playground />} />
            <Route path="/chat/sessions" element={<SessionPage />} />
            <Route path="/document-editor" element={<DocumentEditor />} />
            <Route
              path="/document-editor/:sessionId"
              element={<DocumentEditor />}
            />
            <Route
              path="/document-editor/drafts"
              element={<DocEditorSessionsPage />}
            />
            <Route path="/admin" element={<Outlet />}>
              <Route path="dashboard" element={<Dashboard />} />
            </Route>
            <Route
              path="*"
              element={<Navigate to={`/home`} replace />}
            />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      </AccessDeniedProvider>
    </NotificationProvider>
  );
}

export default App;
