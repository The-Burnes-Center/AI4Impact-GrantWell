import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { Link, useParams, useSearchParams } from "react-router-dom";

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder"); // Retrieve documentIdentifier

  // Styles for custom components
  const helpPanelStyle = {
    padding: "20px",
    backgroundColor: "#f5f5f5",
    borderRadius: "5px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
    height: "100%",
    overflowY: "auto" as const,
  };

  const headerStyle = {
    fontSize: "24px",
    display: "inline-block",
    color: "#006499",
    marginBottom: "15px",
    fontWeight: "bold",
  };

  const contentStyle = {
    color: "#006499",
  };

  const listItemStyle = {
    marginLeft: "20px",
    marginBottom: "5px",
  };

  const sectionHeaderStyle = {
    fontSize: "24px",
    display: "inline-block",
    color: "#006499",
    marginTop: "15px",
    marginBottom: "10px",
    fontWeight: "bold",
  };

  return (
    <BaseAppLayout
      info={
        <div style={helpPanelStyle}>
          <h3 style={headerStyle}>
            Welcome to the GrantWell chatbot interface!
          </h3>
          <div style={contentStyle}>
            <p>
              The purpose of this chatbot is to prompt you through the project
              narrative section of your grant.
            </p>
            <p>
              For GrantWell to work best, upload supplementary data through the
              "upload data' link to best help us craft a narrative that reflects
              your organization.
            </p>
            <p>Examples of data could include:</p>
            <ul style={{ paddingLeft: "20px" }}>
              <li style={listItemStyle}>Last year's annual report</li>
              <li style={listItemStyle}>Latest accomplishments</li>
              <li style={listItemStyle}>
                Previously submitted proposals for this grant
              </li>
              <li style={listItemStyle}>Project narrative template</li>
            </ul>
            <p>
              Ensure you upload all supplementary data before beginning
              conversation with the chatbot.
            </p>
            <h3 style={sectionHeaderStyle}>Sources</h3>
            <p>
              If the chatbot references any files you've uploaded, they will
              show up underneath the relevant message. Add or delete files
              through the "upload data" button in the other toolbar.
            </p>
            <h3 style={sectionHeaderStyle}>Session history</h3>
            <p>
              All conversations are saved and can be later accessed via{" "}
              <Link
                to="/chatbot/sessions"
                style={{ color: "#006499", textDecoration: "underline" }}
              >
                Sessions
              </Link>
              .
            </p>
          </div>
        </div>
      }
      documentIdentifier={documentIdentifier} // Pass documentIdentifier to BaseAppLayout
      toolsWidth={300}
      content={
        <div>
          <Chat sessionId={sessionId} documentIdentifier={documentIdentifier} />
        </div>
      }
    />
  );
}
