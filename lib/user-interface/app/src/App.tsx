import React, { Suspense, useEffect, useRef } from "react";
import {
  Outlet,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./styles/app.scss";

const Playground = React.lazy(() => import("./pages/chat/playground/PlaygroundPage"));
const SessionPage = React.lazy(() => import("./pages/chat/sessions/SessionsPage"));
const Welcome = React.lazy(() => import("./pages/landing-page/LandingPage"));
const Checklists = React.lazy(() => import("./pages/requirements/ChecklistPage"));
const DocumentEditor = React.lazy(() => import("./pages/document-editor/DocumentEditorPage"));
const DocEditorSessionsPage = React.lazy(() => import("./pages/document-editor/DocEditorSessionsPage"));
const Dashboard = React.lazy(() => import("./pages/dashboard/DashboardPage"));

function ScrollToTop(): null {
  const { pathname, search } = useLocation();
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.focus({ preventScroll: true });
    }

    // Update page title based on route
    const getPageTitle = (path: string): string => {
      const exactMatches: { [key: string]: string } = {
        "/": "GrantWell - Home",
        "/home": "GrantWell - Home",
        "/admin/dashboard": "Admin Dashboard - GrantWell",
        "/chat/sessions": "Chat Sessions - GrantWell",
        "/document-editor": "Document Editor - GrantWell",
        "/document-editor/drafts": "Document Editor Drafts - GrantWell",
      };

      if (exactMatches[path]) {
        return exactMatches[path];
      }

      // Pattern matches for dynamic routes
      if (path.startsWith("/chat/") && path !== "/chat/sessions") {
        return "Chatbot Playground - GrantWell";
      }
      if (path.startsWith("/document-editor/") && path !== "/document-editor/drafts") {
        return "Document Editor Session - GrantWell";
      }
      if (path.startsWith("/requirements/")) {
        return "Requirements Checklist - GrantWell";
      }

      // Default fallback
      return "GrantWell";
    };

    const baseTitle = getPageTitle(pathname);
    document.title = baseTitle;

    const fullPath = pathname + search;
    const fullUrl = window.location.origin + fullPath;
    
    if (prevPathRef.current !== fullPath) {
      prevPathRef.current = fullPath;
      
      const environment = typeof window !== "undefined" && window.__ENVIRONMENT__ 
        ? window.__ENVIRONMENT__ 
        : 'staging';
      const isProduction = environment === 'production';
      
      if (isProduction && typeof window !== "undefined" && window.gtag) {
        window.gtag("config", "G-K27MB9Y26C", {
          page_title: baseTitle,
          page_path: fullPath,
          page_location: fullUrl,
        });
      }
    }
  }, [pathname, search]);

  return null;
}

function App() {
  return <AppContent />;
}

function AppContent() {
  return (
    <>
      <ScrollToTop />
      {/* Brand Banner, Header, and Footer are now rendered globally in AppConfigured */}
      <main id="main-content" role="main" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<div className="lazy-loading-fallback" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>Loading...</div>}>
            <Routes>
            <Route
              index
              path="/"
              element={<Navigate to={`/home`} replace />}
            />
            <Route path="/home" element={<Welcome />} />
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
    </>
  );
}

export default App;
