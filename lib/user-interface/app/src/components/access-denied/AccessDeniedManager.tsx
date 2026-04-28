import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../common/Modal";

export interface AccessDeniedPayload {
  message: string;
  userState?: string | null;
  nofoState?: string | null;
  cta?: { label: string; target: string };
}

interface AccessDeniedContextValue {
  showAccessDenied: (payload: AccessDeniedPayload) => void;
  hideAccessDenied: () => void;
}

const defaultContextValue: AccessDeniedContextValue = {
  showAccessDenied: () => {},
  hideAccessDenied: () => {},
};

export const AccessDeniedContext = createContext<AccessDeniedContextValue>(
  defaultContextValue
);

export const useAccessDenied = () => useContext(AccessDeniedContext);

export const AccessDeniedProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [payload, setPayload] = useState<AccessDeniedPayload | null>(null);
  const navigate = useNavigate();

  const showAccessDenied = useCallback((next: AccessDeniedPayload) => {
    setPayload(next);
  }, []);

  useEffect(() => {
    function onAccessDenied(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      setPayload({
        message:
          detail.message ||
          "This grant is not available for your state. Please contact a platform administrator to request access.",
        userState: detail.userState,
        nofoState: detail.nofoState,
        cta: detail.cta,
      });
    }
    window.addEventListener("grantwell:access-denied", onAccessDenied);
    return () => window.removeEventListener("grantwell:access-denied", onAccessDenied);
  }, []);

  const hideAccessDenied = useCallback(() => {
    setPayload(null);
  }, []);

  const handleCta = useCallback(() => {
    const target = payload?.cta?.target || "/home";
    setPayload(null);
    navigate(target);
  }, [navigate, payload]);

  return (
    <AccessDeniedContext.Provider value={{ showAccessDenied, hideAccessDenied }}>
      {children}
      <Modal
        isOpen={!!payload}
        onClose={hideAccessDenied}
        title="Grant not available for your state"
      >
        <div className="modal-form">
          <p className="modal-description" style={{ marginBottom: 16 }}>
            {payload?.message ||
              "This grant is not available for your state. Please contact a platform administrator to request access."}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-button secondary"
              onClick={hideAccessDenied}
            >
              Close
            </button>
            <button
              type="button"
              className="modal-button primary"
              onClick={handleCta}
            >
              {payload?.cta?.label || "Go back to home"}
            </button>
          </div>
        </div>
      </Modal>
    </AccessDeniedContext.Provider>
  );
};
