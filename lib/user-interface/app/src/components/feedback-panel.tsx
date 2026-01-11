import React from 'react';
import { useEffect } from 'react';
import { Box, ColumnLayout, Container, ExpandableSection, Header, Link, SpaceBetween, SplitPanel } from '@cloudscape-design/components';

export interface FeedbackPanelProps {
  selectedFeedback: any;
}

export default function EmailPanel(props: FeedbackPanelProps) {

  useEffect(() => {
  }, [props.selectedFeedback]);

  return (
    <div>
      <SplitPanel header="Selected Feedback" hidePreferencesButton={true}>
        <ColumnLayout columns={2}>
          <SpaceBetween size="m">
            <Container
              header={
                <Header
                  variant="h2"
                >
                  User Prompt
                </Header>
              }
            >
              {props.selectedFeedback.UserPrompt ? props.selectedFeedback.UserPrompt : "No feedback selected"}
            </Container>

            <Container
              header={
                <Header
                  variant="h2"
                >
                  User Comments
                </Header>
              }
            >
              {props.selectedFeedback.FeedbackComments ? props.selectedFeedback.FeedbackComments : "No feedback selected"}
            </Container>
            
          </SpaceBetween>
          <Container
            header={
              <Header
                variant="h2"
              >
                Chatbot Response
              </Header>
            }
          >
            {props.selectedFeedback.ChatbotMessage ? props.selectedFeedback.ChatbotMessage : "No feedback selected"}
            {props.selectedFeedback.Sources ?
                
                <ExpandableSection headerText="Sources">
                  <ColumnLayout columns={2} variant="text-grid">
                    <SpaceBetween size="l">
                      <Box variant="h3" padding="n">
                        Title
                      </Box>
                      {(JSON.parse(props.selectedFeedback.Sources) as any[]).map((item) =>
                        item.title)}
                    </SpaceBetween>
                    <SpaceBetween size="l">
                      <Box variant="h3" padding="n">
                        URL
                      </Box>
                      
                      {(JSON.parse(props.selectedFeedback.Sources) as any[]).map((item, index) =>
                        <Link key={index} href={item.uri} external={true} variant="primary">
                          {item.uri.match(/^(?:https?:\/\/)?([\w-]+(\.[\w-]+)+)/)[1]}
                        </Link>)}
                    </SpaceBetween>
                  </ColumnLayout>
                </ExpandableSection>

                : "No feedback selected"}
          </Container>
        </ColumnLayout>
      </SplitPanel>
    </div>
  );
}