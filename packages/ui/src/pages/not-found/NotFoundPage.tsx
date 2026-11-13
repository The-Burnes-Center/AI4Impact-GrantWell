import { Link } from "react-router";
import { usePageTitle } from "../../common/page-title";

export default function NotFoundPage() {
  usePageTitle("Page not found");

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
