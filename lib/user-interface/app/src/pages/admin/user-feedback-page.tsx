import { Breadcrumb, Container, Alert } from "react-bootstrap";
import BaseAppLayout from "../../components/base-app-layout";
import FeedbackTab from "./feedback-tab";
import FeedbackPanel from "../../components/feedback-panel";
import { CHATBOT_NAME } from "../../common/constants";
import { useState, useEffect } from "react";
import { Auth } from "aws-amplify";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import "bootstrap/dist/css/bootstrap.min.css";


export default function UserFeedbackPage() {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<any>({});
  const [admin, setAdmin] = useState<boolean>(false);

  /** Check if the signed-in user is an admin */
  useEffect(() => {
    (async () => {
      const result = await Auth.currentAuthenticatedUser();
      if (!result || Object.keys(result).length === 0) {
        Auth.signOut();
        return;
      }

      try {
        const result = await Auth.currentAuthenticatedUser();
        const admin = result?.signInUserSession?.idToken?.payload["custom:role"]
        if (admin) {
          const data = JSON.parse(admin);
          if (data.includes("Admin")) {
            setAdmin(true);
          }
        }
      }
      catch (e){
      }
    })();
  }, []);

  /** If they are not an admin, show a page indicating so */
  if (!admin) {
    return (
      <div
        style={{
          height: "90vh",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Alert variant="danger">
          <Alert.Heading>Configuration error</Alert.Heading>
          You are not authorized to view this page!
        </Alert>
      </div>
    );
  }

  return (    
    <BaseAppLayout
      contentType="cards"
      breadcrumbs={
        <Breadcrumb>
          <Breadcrumb.Item 
            onClick={() => navigate(`/chatbot/playground/${uuidv4()}`)}
            style={{ cursor: "pointer" }}
          >
            {CHATBOT_NAME}
          </Breadcrumb.Item>
          <Breadcrumb.Item active>View Feedback</Breadcrumb.Item>
        </Breadcrumb>
      }
      splitPanel={<FeedbackPanel selectedFeedback={feedback}/>}
      content={
        <Container fluid className="p-4">
          <h1 className="mb-4">View Feedback</h1>
          <FeedbackTab updateSelectedFeedback={setFeedback}/>
        </Container>
      }
    />
  );
}
