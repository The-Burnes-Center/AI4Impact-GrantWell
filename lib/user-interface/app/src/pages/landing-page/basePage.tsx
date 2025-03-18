import React, { useContext, useState, useEffect, CSSProperties, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth } from 'aws-amplify';
import {
  Header,
  SpaceBetween,
  Cards,
  Select,
  Container,
  Link,
  Button
} from '@cloudscape-design/components';
import { ApiClient } from '../../common/api-client/api-client';
import { AppContext } from '../../common/app-context';
import { v4 as uuidv4 } from 'uuid';
import '../styles/base-page.css'

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
  const headerContainerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap", // Wraps on smaller screens
    marginBottom: "40px",
  };

  const logoTitleStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "15px",
  };

  // const descriptionStyle: CSSProperties = {

  // };

  const logoStyle: CSSProperties = {
    width: "65px",
    height: "65px",
  };

  const mainTextColor = "#006499"
  const bodyTextColor = "#6c757d"

  const linkUrl = `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(selectedDocument)}`;

  // **Admin Section Styles**
  const adminContainerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginBottom: '50px',
    marginLeft: '40px',
    flexWrap: 'wrap', // Allows wrapping on smaller screens
  };

  const adminTextStyle: CSSProperties = {
    fontSize: '16px',
    fontStyle: 'italic',
    color: '#555',
    margin: '0 25px 10px 0', // Adjust margins for responsiveness
    textAlign: 'left',
    width: '100%',
    maxWidth: '400px',
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
          result?.signInUserSession?.idToken?.payload['custom:role'];
        if (adminRole && adminRole.includes('Admin')) {
          setIsAdmin(true); // Set admin status to true if user has admin role
        }
      } catch (e) {
        console.error('Error checking admin status:', e);
      }
    })();
  }, []);

  // Load recently viewed NOFOs from localStorage
  useEffect(() => {
    const storedHistory =
      JSON.parse(localStorage.getItem('recentlyViewedNOFOs')) || [];
    setRecentlyViewedNOFOs(storedHistory);
  }, []);

  // Fetch NOFO documents from S3
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        await getNOFOListFromS3();
      } catch (error) {
        console.error('Failed to fetch NOFO documents:', error);
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
          value: document + '/',
        }))
      );
    } catch (error) {
      console.error('Error retrieving NOFOs: ', error);
    }
    setLoading(false);
  };

  // Handle NOFO selection
  const handleNOFOSelect = (href, selectedNOFO) => {
    const now = new Date().toLocaleString();
    const updatedHistory = [
      {
        label: selectedNOFO.label,
        value: selectedNOFO.value,
        lastViewed: now,
      },
      ...recentlyViewedNOFOs.filter(
        (nofo) => nofo.value !== selectedNOFO.value
      ),
    ].slice(0, 3);

    setRecentlyViewedNOFOs(updatedHistory);
    localStorage.setItem(
      'recentlyViewedNOFOs',
      JSON.stringify(updatedHistory)
    );
    navigate(href);
  };

  // Upload a new NOFO (Admin functionality)
  const uploadNOFO = async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';

    fileInput.onchange = async (event) => {
      const file = fileInput.files[0];

      if (!file) return;

      try {
        const documentName = file.name.split('.').slice(0, -1).join('');
        let newFilePath;
        if (file.type === 'text/plain') {
          newFilePath = `${documentName}/NOFO-File-TXT`;
        } else if (file.type === 'application/pdf') {
          newFilePath = `${documentName}/NOFO-File-PDF`;
        } else {
          newFilePath = `${documentName}/NOFO-File`;
        }

        const signedUrl = await apiClient.landingPage.getUploadURL(
          newFilePath,
          file.type
        );
        await apiClient.landingPage.uploadFileToS3(signedUrl, file);

        alert('File uploaded successfully!');
        await getNOFOListFromS3();
      } catch (error) {
        console.error('Upload failed:', error);
        alert('Failed to upload the file.');
      }
    };

    fileInput.click();
  };
  


  // Navigate to checklists
  const goToChecklists = () => {
    if (selectedDocument) {
      const summaryFileKey = `${selectedDocument.value}`;
      navigate(
        `/landing-page/basePage/checklists/${encodeURIComponent(
          summaryFileKey
        )}`
      );
    }
  };



  // **Components**
  // HistoryPanel component
  const HistoryPanel = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)", // 2 columns
        gap: "25px", // Space between grid items
        marginBottom: "30px"
      }}
    >
      <h2 style={{ gridColumn: "span 2", fontSize: "24px", lineHeight: "1", textAlign: "center", color: mainTextColor }}>
        Recently Viewed NOFOs
      </h2>
      {recentlyViewedNOFOs.length > 0 ? (
        recentlyViewedNOFOs.slice(0, 4).map((nofo, index) => (
          <div
            key={index}
            style={{
              padding: "15px",
              border: "1px solid #e1e4e8",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            }}
          >
            <Link
              onFollow={() =>
                handleNOFOSelect(
                  `/landing-page/basePage/checklists/${encodeURIComponent(nofo.value)}`,
                  nofo
                )
              }
            >
              <span style={{ fontSize: "18px", fontWeight: "bold", display: "block", marginBottom: "8px", color: mainTextColor }}>
                {nofo.label}
              </span>
            </Link>
            <div style={{ fontSize: "14px", color: "#6c757d" }}>
              <span>Last viewed: {nofo.lastViewed}</span>
            </div>
          </div>
        ))
      ) : (
        <p
          style={{
            gridColumn: "span 2",
            color: "#6c757d",
            fontSize: "16px",
            textAlign: "center",
          }}
        >
          You haven’t viewed any NOFOs recently. Select or upload a document at the panel to get started.
        </p>
      )}
    </div>
  );

  // Reusable InfoBanner Component
  const InfoBanner = ({
    title,
    description,
    buttonText = '',
    buttonAction = null,
    imageSrc = null, // Default to null if not provided
    imageAlt = '',
    height,
    backgroundColor = '#06293d',
    mainTextColor = '#ffffff',
    bodyTextColor = '#ffffff',
    // buttonColor = '#FF9B00',
    titleFontSize = '24px',
    buttonVariant = "normal", // Default to "normal"
    linkUrl = null,
    imagePosition = 'right',
    titleAlign = 'left',
    imageWidth = '150px',
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
    const content = (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          maxWidth: '900px',
          alignItems: 'center',
          margin: '0 auto',
          flexDirection: 'row',
          gap: '30px',
          marginTop: '15px',
        }}
      >
          {imagePosition === 'left' && imageSrc && (
            <img src={imageSrc} alt={imageAlt} style={{width:imageWidth}}/>
          )}
          <div
            style={{
              display:'flex',
              justifyContent: 'center',
              flexDirection: 'column',
              textAlign: titleAlign,
            }}
          >
              { title && (
                <h1 style={{ fontSize: titleFontSize, margin: 1, color:mainTextColor}}>
                  {title}
                </h1>
              )}
              <p style={{ fontSize: '13px', color: bodyTextColor}}>
                {description}
              </p>
        </div>
        {imagePosition === 'right' && imageSrc && (
        <img src={imageSrc} alt={imageAlt} style={{ width: imageWidth }} />
      )}
        {buttonText && buttonAction && (
          <Button
            onClick={buttonAction}
            variant={buttonVariant}
            ariaLabel={buttonText}>
              {buttonText}
            </Button>
        )}
        </div>
    );
    return(
    <div
      style={{
        backgroundColor: backgroundColor,
        padding: '20px',
        marginBlockEnd: '0',
        width: '100vw',
        height: height,
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
        marginTop: "0px",
        marginBottom: "0px",
      }}
    >
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', color: 'inherit' }}
          >
            {content}
          </a>
      ): (
        content
      )}
      </div>
    );
  };
      {/* <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          maxWidth: "900px", // Set a max width for the page
          alignItems: 'center',
          margin: '0 auto',
          flexDirection: 'row',
          //height: '120px',
          gap: '30px',
          marginTop: '15px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <h1 style={{ fontSize: titleFontSize, margin: 1, color: mainTextColor }}>{title}</h1>
          <p style={{ fontSize: '13px', color: bodyTextColor }}>{description}</p>
        </div>
        {buttonText && buttonAction && (
          <Button 
            onClick={buttonAction} 
            variant={buttonVariant}
            aria-label={buttonText}
          >
            {buttonText}
          </Button>
        )}
        {imageSrc && (
          <img src={imageSrc} alt={imageAlt} style={{ width: '300px' }} />
        )}
      </div>
    </div>
  ); */}

  const ContentBox = ({ children, backgroundColor = '#f1f6f9' }) => (
    <div
      style={{
        width: '100vw', // Full screen width
        backgroundColor, // Customizable background color
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
        boxSizing: 'border-box', // Ensure padding doesn’t expand width
        padding: '20px 0', // Add padding for vertical spacing
        marginTop: "0px",
        marginBottom: "0px",
      }}
    >
      <div
        style={{
          maxWidth: '950px', // Center-aligned content width
          margin: '0 auto', // Center horizontally
          padding: '0 40px', // Respect page margins
          boxSizing: 'border-box',
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
        marginBottom: "30px"
      }}
    >
      <h2 style={{ 
        gridColumn: "span 3", 
        fontSize: "24px", 
        lineHeight: "1", 
        textAlign: "center", 
        color: mainTextColor 
      }}>
        Additional Resources
      </h2>
      {[
        {
          title: "Federal Grant Finder",
          href: "https://www.usdigitalresponse.org/grant/grant-finder",
          description: "Find grants you are eligible for with U.S. Digital Response's Federal Grants Finder.",
        },
        {
          title: "Register for Federal Funds Partnership Meetings",
          href: "https://us02web.zoom.us/meeting/register/tZUucuyhrzguHNJkkh-XlmZBlQQKxxG_Acjl",
          description: "Stay updated on current funding opportunities by joining our monthly informational sessions.",
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
            textAlign: "center" // Center all text content
          }}
        >
          <Link
            href={resource.href}
            external
          >
            <span style={{ 
              fontSize: "18px", 
              fontWeight: "bold", 
              display: "block", 
              marginBottom: "8px", 
              color: mainTextColor,
              textAlign: "center" // Center the title specifically
            }}>
              {resource.title}
            </span>
          </Link>
          <div style={{ 
            fontSize: "14px", 
            color: bodyTextColor,
            textAlign: "center" // Center the description specifically
          }}>
            {resource.description}
          </div>
        </div>
      ))}
    </div>
  );



  // **Render**
  return (
    <Container
      disableContentPaddings
    >
      <div
        style={{
          maxWidth: "950px",
          margin: "0 auto",
          padding: "0 40px",
          marginTop: "70px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "0",
        }}
      >
        {/* Header with logo and title */}
        {/* Header Section */}
        <div style={headerContainerStyle}>
          {/* Logo and Title */}
          <div style={logoTitleStyle}>
            <img
              src="/images/stateseal-color.png"
              alt="State Seal"
              style={logoStyle}
            />
            <h1 style={{ fontSize: "45px", margin: 0, color: mainTextColor }}>GrantWell</h1>
          </div>

          {/* Description */}
          <div style={{
            flex: "1 1 auto",
            maxWidth: "400px",
            textAlign: "center",
            fontSize: "19px",
            lineHeight: "1.3",
            color: mainTextColor
          }}>
            <p>
              An AI tool to help Massachusetts communities secure federal grants
            </p>
          </div>
        </div>


        <div
          style={{
            maxWidth: "650px", // Limit the maximum width of the Select component
            width: "100%", // Allow it to shrink for smaller screens
            margin: "0 auto", // Center it horizontally
          }}
        >
          <Select
            selectedOption={selectedDocument}
            onChange={({ detail }) =>
              setSelectedDocument(detail.selectedOption)
            }
            options={documents}
            placeholder="Find a Notice of Funding Opportunity Document (NOFO)"
            filteringType="auto"
            aria-label="Select a NOFO document"
          />

        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '25px',
            marginTop: "35px",
            marginBottom: '75px',
            width: '100%',
            padding: '0 50px', // Add 50px padding on left and right
            boxSizing: 'border-box',
            flexWrap: 'wrap', // Allows wrapping on smaller screens
            justifyContent: 'center', // Centers items when wrapped
          }}
        >
          <Button
            onClick={() =>
              handleNOFOSelect(
                `/landing-page/basePage/checklists/${encodeURIComponent(
                  selectedDocument.value
                )}`,
                selectedDocument
              )
            }
            disabled={!selectedDocument}
            variant="primary"
            aria-label="View Key Requirements"
          >
            View Key Requirements
          </Button>

          <Button
            onClick={() => 
            navigate (`/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(selectedDocument.value)}`)
            }
            disabled={!selectedDocument}
            variant="primary"
            aria-label="Start Chat"
          >
            Start Narrative Draft
          </Button>

        </div>


        {/* Main Content */}

        {/* <div ref={selectNOFORef}></div> */}
        {/* <SpaceBetween size="xs"> */}

        <ContentBox backgroundColor="#F6FCFF">
          <HistoryPanel />
        </ContentBox>

        {isAdmin && (
          <InfoBanner
            title="Admin Panel"
            description="Upload a new NOFO to the NOFO dropdown above. It will take 5-7 minutes for the document to process and appear in the dropdown. Grab a coffee, and it'll be ready for your review!"
            buttonText="Upload New NOFO"
            buttonAction={uploadNOFO}
            backgroundColor="##f1f6f9"
            mainTextColor="#006499"
            bodyTextColor="#6c757d"
            titleFontSize='24px'
            buttonVariant="primary"
          />
        )}

        <div style={{ flex: 1 }} />

        {/* "Additional Resources" Panel */}
        <ContentBox>
          <ResourcesPanel />
        </ContentBox>

        {/* </SpaceBetween> */}
        {/* Feedback Section */}
        <InfoBanner
          title="We Value Your Feedback!"
          height="150px"
          description="Help us make GrantWell better by sharing your thoughts and suggestions."
          buttonText="Open Feedback Form"
          buttonAction={() =>
            window.open('https://forms.gle/M2PHgWTVVRrRubpc7', '_blank')
          }
          backgroundColor='#006499'
          // buttonColor="#FF9B00"
        />

        {/* Affiliations Section */}
        <InfoBanner
          title="Our Affiliations"
          height= "125px"
          description=""
          imageSrc="/images/burnesLogo.png"
          imageAlt="Burnes Center Logo"
          titleAlign="left"
          imagePosition='right'
          imageWidth="200px"
        />
        <InfoBanner
          title=''
          height= "100px"
          imageSrc='/images/creativeCommons.png'
          imageAlt='Creative Commons'
          description="This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License"
          linkUrl={'https://creativecommons.org/licenses/by-sa/4.0/'}
          backgroundColor='#000000'
          titleFontSize='16px'
          imagePosition='left'
          imageWidth="75px"
        />
      </div>
    </Container>
  );
}