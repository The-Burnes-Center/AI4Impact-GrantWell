import { useEffect } from "react";
import { Link } from "react-router";
import { useBranding } from "../../common/branding";

export default function NotFoundPage() {
  const { appName } = useBranding();

  useEffect(() => {
    document.title = `Page not found - ${appName}`;
  }, [appName]);

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "48px 16px", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "12px" }}>Page not found</h1>
      <p>This page doesn&apos;t exist. Check the address.</p>
      <p>
        <Link to="/home" style={{ color: "var(--gw-color-primary)", fontWeight: 600 }}>
          Find grants on the home page
        </Link>
      </p>
    </div>
  );
}
