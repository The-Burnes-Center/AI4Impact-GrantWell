import React from 'react';
import { useEffect } from 'react';
import { Card, Accordion, Row, Col } from 'react-bootstrap';
import "bootstrap/dist/css/bootstrap.min.css";

export interface FeedbackPanelProps {
  selectedFeedback: any;
}

export default function EmailPanel(props: FeedbackPanelProps) {

  useEffect(() => {
  }, [props.selectedFeedback]);

  return (
    <div className="p-3">
      <h5 className="mb-3">Selected Feedback</h5>
      <Row className="g-3">
        <Col md={6}>
          <Card className="mb-3">
            <Card.Header>
              <h6 className="mb-0">User Prompt</h6>
            </Card.Header>
            <Card.Body>
              {props.selectedFeedback.UserPrompt ? props.selectedFeedback.UserPrompt : "No feedback selected"}
            </Card.Body>
          </Card>
          <Card>
            <Card.Header>
              <h6 className="mb-0">User Comments</h6>
            </Card.Header>
            <Card.Body>
              {props.selectedFeedback.FeedbackComments ? props.selectedFeedback.FeedbackComments : "No feedback selected"}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card>
            <Card.Header>
              <h6 className="mb-0">Chatbot Response</h6>
            </Card.Header>
            <Card.Body>
              {props.selectedFeedback.ChatbotMessage ? props.selectedFeedback.ChatbotMessage : "No feedback selected"}
              {props.selectedFeedback.Sources ? (
                <Accordion className="mt-3">
                  <Accordion.Item eventKey="0">
                    <Accordion.Header>Sources</Accordion.Header>
                    <Accordion.Body>
                      <Row>
                        <Col md={6}>
                          <strong>Title</strong>
                          <div className="mt-2">
                            {(JSON.parse(props.selectedFeedback.Sources) as any[]).map((item, index) => (
                              <div key={index}>{item.title}</div>
                            ))}
                          </div>
                        </Col>
                        <Col md={6}>
                          <strong>URL</strong>
                          <div className="mt-2">
                            {(JSON.parse(props.selectedFeedback.Sources) as any[]).map((item, index) => {
                              const match = item.uri.match(/^(?:https?:\/\/)?([\w-]+(\.[\w-]+)+)/);
                              return (
                                <div key={index}>
                                  <a href={item.uri} target="_blank" rel="noopener noreferrer">
                                    {match ? match[1] : item.uri}
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </Col>
                      </Row>
                    </Accordion.Body>
                  </Accordion.Item>
                </Accordion>
              ) : (
                "No feedback selected"
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}