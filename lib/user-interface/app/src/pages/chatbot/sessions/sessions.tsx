import { useState } from "react";
import BaseAppLayout from "../../../components/base-app-layout";
import Sessions from "../../../components/chatbot/sessions";
import { CHATBOT_NAME } from "../../../common/constants";
import useOnFollow from "../../../common/hooks/use-on-follow";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

export default function SessionPage() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");

  // Styles for the breadcrumbs
  const breadcrumbsContainerStyle = {
    padding: "8px 0",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
  };

  const breadcrumbLinkStyle = {
    color: "#0073bb",
    textDecoration: "none",
    cursor: "pointer",
  };

  const breadcrumbSeparatorStyle = {
    margin: "0 8px",
    color: "#5f6b7a",
  };

  const breadcrumbCurrentStyle = {
    color: "#5f6b7a",
    fontWeight: 400,
  };

  // Handle navigation
  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <BaseAppLayout
      contentType="table"
      //toolsOpen={toolsOpen}
      //onToolsChange={(e) => setToolsOpen(e.detail.open)}
      breadcrumbs={
        <nav style={breadcrumbsContainerStyle} aria-label="Breadcrumbs">
          <a href="/" style={breadcrumbLinkStyle} onClick={handleHomeClick}>
            {CHATBOT_NAME}
          </a>
          <span style={breadcrumbSeparatorStyle}>/</span>
          <span style={breadcrumbCurrentStyle}>Sessions</span>
        </nav>
      }
      content={
        <Sessions toolsOpen={true} documentIdentifier={documentIdentifier} />
      }
    />
  );
}
