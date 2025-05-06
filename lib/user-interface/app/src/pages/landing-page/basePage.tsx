import React, { useContext, useState, useEffect, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth } from 'aws-amplify';
import { ApiClient } from '../../common/api-client/api-client';
import { AppContext } from '../../common/app-context';
import { v4 as uuidv4 } from 'uuid';
import '../styles/base-page.css';
import IntegratedSearchBar from '../../components/search/IntegratedSearchBar';

export default function Welcome({ theme }) {
  // **State Variables**
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false); // Track admin status
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [recentlyViewedNOFOs, setRecentlyViewedNOFOs] = useState([]);

  // **Context and Navigation**
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const navigate = useNavigate();

  // **Styles**
  const logoStyle: CSSProperties = {
    width: "100px",
    height: "100px",
  };

  const mainTextColor = "#006499";
  const bodyTextColor = "#6c757d";
  const primaryBlue = "#0073bb"; // Match header blue color

  const containerStyle: CSSProperties = {
    maxWidth: "950px",
    margin: "0 auto",
    padding: "0 40px",
    marginTop: "70px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "0",
  };

  const buttonStyle: CSSProperties = {
    backgroundColor: primaryBlue, // Use blue from the header when active
    color: "white",
    border: "none",
    padding: "12px 22px",
    fontSize: "16px",
    borderRadius: "25px", // Oval/pill shape
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontWeight: "500",
    margin: "0 5px", // Reduced from 10px to 5px
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  };

  const disabledButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "#f0f0f0",
    color: "#aaaaaa",
    cursor: "not-allowed",
    boxShadow: "none",
  };

  const buttonHoverStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((e.target as HTMLButtonElement).disabled) return;
    (e.target as HTMLElement).style.backgroundColor = "#005d94"; // Darker blue on hover
    (e.target as HTMLElement).style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
  };

  const buttonLeaveStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((e.target as HTMLButtonElement).disabled) return;
    (e.target as HTMLElement).style.backgroundColor = primaryBlue;
    (e.target as HTMLElement).style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
  };

  const linkStyle: CSSProperties = {
    color: "#006499",
    textDecoration: "none",
  };

  // **Effect Hooks**
  // Check for admin privilege
  useEffect(() => {
    (async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result || Object.keys(result).length === 0) {
          Auth.signOut();
          return;
        }
        const adminRole =
          result?.signInUserSession?.idToken?.payload["custom:role"];
        if (adminRole && adminRole.includes("Admin")) {
          setIsAdmin(true); // Set admin status to true if user has admin role
        }
      } catch (e) {
        console.error("Error checking admin status:", e);
      }
    })();
  }, []);

  // Load recently viewed NOFOs from localStorage
  useEffect(() => {
    const storedHistory =
      JSON.parse(localStorage.getItem("recentlyViewedNOFOs")) || [];
    setRecentlyViewedNOFOs(storedHistory);
  }, []);

  // Fetch NOFO documents from S3
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        await getNOFOListFromS3();
      } catch (error) {
        console.error("Failed to fetch NOFO documents:", error);
      }
    };
    fetchDocuments();
  }, []);

  // **Functions**
  // Get NOFO list from S3
  const getNOFOListFromS3 = async () => {
    setLoading(true);
    try {
      const result = await apiClient.landingPage.getNOFOs();
      const folders = result.folders || [];
      setDocuments(
        folders.map((document) => ({
          label: document,
          value: document + "/",
        }))
      );
    } catch (error) {
      console.error("Error retrieving NOFOs: ", error);
    }
    setLoading(false);
  };

  // Handle selecting a NOFO document
  const handleNOFOSelect = (href, selectedNOFO) => {
    // Add current timestamp to the selectedNOFO object
    const nofoWithTimestamp = {
      ...selectedNOFO,
      lastViewed: new Date().toLocaleString()
    };
    
    // Update recently viewed NOFOs in localStorage
    const updatedHistory = [
      nofoWithTimestamp,
      ...recentlyViewedNOFOs.filter(
        (item) => item.value !== selectedNOFO.value
      ),
    ].slice(0, 3); // Keep only the 3 most recent items
    setRecentlyViewedNOFOs(updatedHistory);
    localStorage.setItem(
      "recentlyViewedNOFOs",
      JSON.stringify(updatedHistory)
    );

    // Navigate to the selected NOFO
    navigate(href);
  };

  // **Components**
  // HistoryPanel component
  const HistoryPanel = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)", // 3 columns instead of 2
        gap: "20px", // Slightly reduced gap for 3 columns
        marginBottom: "30px",
      }}
    >
      <h2
        style={{
          gridColumn: "span 3", // Span all 3 columns
          fontSize: "24px",
          lineHeight: "1",
          textAlign: "center",
          color: mainTextColor,
          marginBottom: "20px",
        }}
      >
        Recently Viewed NOFOs
      </h2>
      {recentlyViewedNOFOs.length > 0 ? (
        recentlyViewedNOFOs.slice(0, 6).map(
          (
            nofo,
            index // Show up to 6 items
          ) => (
            <div
              key={index}
              style={{
                padding: "15px",
                border: "1px solid #e1e4e8",
                borderRadius: "8px",
                backgroundColor: "#f9f9f9",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                transition: "all 0.2s ease",
                cursor: "pointer",
                height: "100%", // Make all cards the same height
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
              onClick={() =>
                handleNOFOSelect(
                  `/landing-page/basePage/checklists/${encodeURIComponent(
                    nofo.value
                  )}`,
                  nofo
                )
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 4px 8px rgba(0, 0, 0, 0.15)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.1)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: "8px",
                  color: primaryBlue,
                }}
              >
                {nofo.label}
              </span>
              <div
                style={{
                  fontSize: "14px",
                  color: "#6c757d",
                  marginTop: "auto",
                }}
              >
                <span>Last viewed: {nofo.lastViewed}</span>
              </div>
            </div>
          )
        )
      ) : (
        <p
          style={{
            gridColumn: "span 3", // Span all 3 columns
            color: "#6c757d",
            fontSize: "16px",
            textAlign: "center",
          }}
        >
          You haven't viewed any NOFOs recently. Select or upload a document at
          the panel to get started.
        </p>
      )}
    </div>
  );

  // Reusable InfoBanner Component
  const InfoBanner = ({
    title,
    description,
    buttonText = "",
    buttonAction = null,
    imageSrc = null, // Default to null if not provided
    imageAlt = "",
    height,
    backgroundColor = "#06293d",
    mainTextColor = "#ffffff",
    bodyTextColor = "#ffffff",
    titleFontSize = "24px",
    buttonVariant = "normal", // Default to "normal"
    linkUrl = null,
    imagePosition = "right",
    titleAlign = "left",
    imageWidth = "150px",
  }: {
    title: string;
    description: string;
    buttonText?: string;
    buttonAction?: (() => void) | null;
    imageSrc?: string | null;
    imageAlt?: string;
    backgroundColor?: string;
    mainTextColor?: string;
    bodyTextColor?: string;
    titleFontSize?: string;
    buttonVariant?: "primary" | "normal" | "link" | "icon";
    linkUrl?: any;
    height?: any;
    imagePosition?: string;
    titleAlign?: any;
    imageWidth?: any;
  }) => {
    const bannerButtonStyle: CSSProperties = {
      backgroundColor: buttonVariant === "primary" ? "#006499" : "#FF9B00",
      color: "white",
      border: "none",
      padding: "10px 15px",
      borderRadius: "4px",
      cursor: "pointer",
      textDecoration: buttonVariant === "link" ? "underline" : "none",
    };

    const content = (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          maxWidth: "900px",
          alignItems: "center",
          margin: "0 auto",
          flexDirection: "row",
          gap: "30px",
          marginTop: "15px",
        }}
      >
        {imagePosition === "left" && imageSrc && (
          <img src={imageSrc} alt={imageAlt} style={{ width: imageWidth }} />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            textAlign: titleAlign,
            width: buttonText ? "70%" : "80%", // Adjust width based on whether there's a button
          }}
        >
          {title && (
            <h1
              style={{
                fontSize: titleFontSize,
                margin: 1,
                color: mainTextColor,
              }}
            >
              {title}
            </h1>
          )}
          <p style={{ fontSize: "13px", color: bodyTextColor }}>
            {description}
          </p>
        </div>
        {imagePosition === "right" && imageSrc && (
          <img src={imageSrc} alt={imageAlt} style={{ width: imageWidth }} />
        )}
        {buttonText && buttonAction && (
          <button
            onClick={buttonAction}
            style={bannerButtonStyle}
            aria-label={buttonText}
          >
            {buttonText}
          </button>
        )}
      </div>
    );
    return (
      <div
        style={{
          backgroundColor: backgroundColor,
          padding: "20px",
          marginBlockEnd: "0",
          width: "100vw",
          height: height,
          position: "relative",
          left: "50%",
          right: "50%",
          marginLeft: "-50vw",
          marginRight: "-50vw",
          marginTop: "0px",
          marginBottom: "0px",
        }}
      >
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    );
  };

  const ContentBox = ({ children, backgroundColor = "#f1f6f9" }) => (
    <div
      style={{
        width: "100vw", // Full screen width
        backgroundColor, // Customizable background color
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        boxSizing: "border-box", // Ensure padding doesn't expand width
        padding: "20px 0", // Add padding for vertical spacing
        marginTop: "0px",
        marginBottom: "0px",
      }}
    >
      <div
        style={{
          maxWidth: "950px", // Center-aligned content width
          margin: "0 auto", // Center horizontally
          padding: "0 40px", // Respect page margins
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );

  // Replace the existing Cards component with this:
  const ResourcesPanel = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "25px",
        marginBottom: "30px",
      }}
    >
      <h2
        style={{
          gridColumn: "span 3",
          fontSize: "24px",
          lineHeight: "1",
          textAlign: "center",
          color: mainTextColor,
        }}
      >
        Additional Resources
      </h2>
      {[
        {
          title: "Federal Grant Finder",
          href: "https://www.usdigitalresponse.org/grant/grant-finder",
          description:
            "Find grants you are eligible for with U.S. Digital Response's Federal Grants Finder.",
        },
        {
          title: "Register for Federal Funds Partnership Meetings",
          href: "https://us02web.zoom.us/meeting/register/tZUucuyhrzguHNJkkh-XlmZBlQQKxxG_Acjl",
          description:
            "Stay updated on current funding opportunities by joining our monthly informational sessions.",
        },
        {
          title: "Federal Grant Application Resources",
          href: "https://www.mass.gov/lists/federal-funds-grant-application-resources",
          description: "Access categorized grant resources on mass.gov.",
        },
      ].map((resource, index) => (
        <div
          key={index}
          style={{
            padding: "15px",
            border: "1px solid #e1e4e8",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            textAlign: "center", // Center all text content
          }}
        >
          <a
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            <span
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                display: "block",
                marginBottom: "8px",
                color: mainTextColor,
                textAlign: "center", // Center the title specifically
              }}
            >
              {resource.title}
            </span>
          </a>
          <div
            style={{
              fontSize: "14px",
              color: bodyTextColor,
              textAlign: "center", // Center the description specifically
            }}
          >
            {resource.description}
          </div>
        </div>
      ))}
    </div>
  );

  // **Render**
  return (
    <div style={containerStyle}>
      <div
        style={{
          maxWidth: "950px",
          margin: "0 auto",
          padding: "0 40px",
          marginTop: "20px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "0",
        }}
      >
        {/* Header with logo and title */}
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: "30px",
            position: "relative",
          }}
        >
          {/* Logo and Title */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <img
              src="/images/stateseal-color.png"
              alt="State Seal"
              style={logoStyle}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <h1
                style={{
                  fontSize: "52px",
                  margin: 0,
                  color: mainTextColor,
                  fontWeight: "600",
                }}
              >
                GrantWell
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: mainTextColor,
                  margin: "-2px 3px 0 8px",
                  fontStyle: "italic",
                  maxWidth: "230px",
                  lineHeight: "1.4",
                }}
              >
                An AI tool to help Massachusetts communities secure federal
                grants
              </p>
            </div>
          </div>
        </div>

        {/* Welcome message */}
        <div
          style={{
            textAlign: "center",
            margin: "50px auto 25px auto",
            fontSize: "18px",
            color: mainTextColor,
            fontWeight: "500",
          }}
        >
          Hello, find grants and funding opportunities
        </div>

        {/* New integrated search bar */}
        <IntegratedSearchBar 
          documents={documents}
          onSelectDocument={setSelectedDocument}
          isLoading={loading}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "5px", // Reduced from 10px to 5px
            marginTop: "40px", // Increased from 20px to 40px for better spacing
            marginBottom: "45px",
            width: "100%",
            padding: "0 50px", // Add 50px padding on left and right
            boxSizing: "border-box",
            flexWrap: "wrap", // Allows wrapping on smaller screens
            justifyContent: "center", // Centers items when wrapped
          }}
        >
          <button
            onClick={() =>
              handleNOFOSelect(
                `/landing-page/basePage/checklists/${encodeURIComponent(
                  selectedDocument.value
                )}`,
                selectedDocument
              )
            }
            disabled={!selectedDocument}
            style={selectedDocument ? buttonStyle : disabledButtonStyle}
            onMouseEnter={buttonHoverStyle}
            onMouseLeave={buttonLeaveStyle}
            aria-label="View Key Requirements"
          >
            View Key Requirements
          </button>
          <button
            onClick={() =>
              navigate(
                `/chatbot/document-editor/${uuidv4()}?folder=${encodeURIComponent(
                  selectedDocument.value
                )}`
              )
            }
            disabled={!selectedDocument}
            style={selectedDocument ? buttonStyle : disabledButtonStyle}
            onMouseEnter={buttonHoverStyle}
            onMouseLeave={buttonLeaveStyle}
            aria-label="Start Document Editor"
          >
            Write Project Narrative
          </button>
          <button
            onClick={() =>
              navigate(
                `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
                  selectedDocument.value
                )}`
              )
            }
            disabled={!selectedDocument}
            style={selectedDocument ? buttonStyle : disabledButtonStyle}
            onMouseEnter={buttonHoverStyle}
            onMouseLeave={buttonLeaveStyle}
            aria-label="Start Chat"
          >
            Get Grant Help
          </button>
        </div>

        <ContentBox backgroundColor="#F6FCFF">
          <HistoryPanel />
        </ContentBox>

        <div style={{ flex: 1 }} />

        {/* "Additional Resources" Panel */}
        <ContentBox>
          <ResourcesPanel />
        </ContentBox>

        {/* Feedback Section */}
        <InfoBanner
          title="We Value Your Feedback!"
          height="150px"
          description="Help us make GrantWell better by sharing your thoughts and suggestions."
          buttonText="Open Feedback Form"
          buttonAction={() =>
            window.open("https://forms.gle/M2PHgWTVVRrRubpc7", "_blank")
          }
          backgroundColor="#006499"
        />

        {/* Affiliations Section */}
        <InfoBanner
          title="Our Affiliations"
          height="125px"
          description=""
          imageSrc="/images/burnesLogo.png"
          imageAlt="Burnes Center Logo"
          titleAlign="left"
          imagePosition="right"
          imageWidth="200px"
        />
        <InfoBanner
          title=""
          height="100px"
          imageSrc="/images/creativeCommons.png"
          imageAlt="Creative Commons"
          description="This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License"
          linkUrl={"https://creativecommons.org/licenses/by-sa/4.0/"}
          backgroundColor="#000000"
          titleFontSize="16px"
          imagePosition="left"
          imageWidth="75px"
        />
      </div>
    </div>
  );
}
