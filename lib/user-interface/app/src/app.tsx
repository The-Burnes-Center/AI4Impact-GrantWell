import {
  Outlet,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import Playground from "./pages/chatbot/playground/playground";
import DataPage from "./pages/admin/data-view-page";
import UserFeedbackPage from "./pages/admin/user-feedback-page";
import SessionPage from "./pages/chatbot/sessions/sessions";
import Welcome from "./pages/landing-page/basePage";
import Checklists from "./pages/requirements-gathering/checklist";
import DocumentEditor from "./pages/document-editor";
import DocEditorSessionsPage from "./pages/document-editor/doc-editor-sessions-page";
import Dashboard from "./pages/Dashboard";
import "./styles/app.scss";
import { useEffect, useRef } from "react";

function ScrollToTop() {
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
        "/landing-page/basePage": "GrantWell - Home",
        "/dashboard": "Admin Dashboard - GrantWell",
        "/chatbot/sessions": "Chat Sessions - GrantWell",
        "/document-editor": "Document Editor - GrantWell",
        "/document-editor/drafts": "Document Editor Drafts - GrantWell",
        "/admin/data": "Admin Data View - GrantWell",
        "/admin/user-feedback": "User Feedback - GrantWell",
      };

      if (exactMatches[path]) {
        return exactMatches[path];
      }

      // Pattern matches for dynamic routes
      if (path.startsWith("/chatbot/playground/")) {
        return "Chatbot Playground - GrantWell";
      }
      if (path.startsWith("/document-editor/") && path !== "/document-editor/drafts") {
        return "Document Editor Session - GrantWell";
      }
      if (path.startsWith("/landing-page/basePage/checklists/")) {
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
      
      if (typeof window !== "undefined" && window.gtag) {
        // Send complete page view data to Google Analytics
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
        <Routes>
          <Route
            index
            path="/"
            element={<Navigate to={`/landing-page/basePage`} replace />} // root path
          />
          <Route path="/landing-page/basePage" element={<Outlet />}>
            <Route path="" element={<Welcome />} />
            <Route
              path="/landing-page/basePage/checklists/:documentIdentifier"
              element={<Checklists />}
            />
          </Route>
          <Route path="/chatbot" element={<Outlet />}>
            <Route path="playground/:sessionId" element={<Playground />} />
            <Route path="sessions" element={<SessionPage />} />
            <Route
              path="document-editor"
              element={<Navigate to="/document-editor" replace />}
            />
          </Route>
          {/* Document editor routes - use the new DocumentEditor component */}
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
            <Route path="data" element={<DataPage />} />
            <Route path="user-feedback" element={<UserFeedbackPage />} />
          </Route>
          {/* Add Dashboard route */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="*"
            element={<Navigate to={`/landing-page/basePage`} replace />}
          />
        </Routes>
      </main>
    </>
  );
}

export default App;
