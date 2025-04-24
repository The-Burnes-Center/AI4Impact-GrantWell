import React from 'react';
import { 
  Box, 
  Button, 
  ColumnLayout, 
  Container, 
  Header, 
  SpaceBetween,
  Badge,
  Icon,
  Cards,
  TextContent
} from '@cloudscape-design/components';
import ReactMarkdown from 'react-markdown';

interface Message {
  type: 'ai' | 'human';
  content: string;
  metadata?: {
    suggestedQuestions?: string[];
    grantRecommendations?: GrantRecommendation[];
    sources?: any[];
  };
}

interface GrantRecommendation {
  id: string;
  name: string;
  matchScore: number;
  eligibilityMatch: boolean;
  fundingAmount: string;
  deadline: string;
  keyRequirements: string[];
  summaryUrl: string;
}

interface ChatMessageSimpleProps {
  message: Message;
  navigateToGrant: (summaryUrl: string) => void;
  startChatWithGrant: (summaryUrl: string) => void;
}

export default function ChatMessageSimple({ message, navigateToGrant, startChatWithGrant }: ChatMessageSimpleProps) {
  if (!message) return null;

  const { type, content, metadata } = message;
  const isAI = type === 'ai';

  // Function to get a badge color based on the match score
  const getMatchBadgeColor = (score: number): "blue" | "green" | "grey" | "red" => {
    if (score >= 90) return "green";
    if (score >= 70) return "blue";
    return "grey";
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: isAI ? 'flex-start' : 'flex-end',
      marginBottom: '12px'
    }}>
      <div
        style={{
          maxWidth: '85%',
          backgroundColor: isAI ? '#f1f6f9' : '#EBF5FF',
          borderRadius: '12px',
          marginLeft: isAI ? '0' : 'auto',
          marginRight: isAI ? 'auto' : '0',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
          padding: '12px 16px'
        }}
      >
        <Box padding="s">
        <SpaceBetween direction="vertical" size="s">
          {isAI ? (
            <>
              <ReactMarkdown>{content}</ReactMarkdown>
              
              {/* Render grant recommendations if available */}
              {metadata?.grantRecommendations && metadata.grantRecommendations.length > 0 && (
                <Cards
                  cardDefinition={{
                    header: item => (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center' 
                      }}>
                        <div>{item.name}</div>
                        <Badge color={getMatchBadgeColor(item.matchScore)}>
                          {item.matchScore}% Match
                        </Badge>
                      </div>
                    ),
                    sections: [
                      {
                        id: "funding",
                        header: "Funding Amount",
                        content: item => item.fundingAmount
                      },
                      {
                        id: "deadline",
                        header: "Deadline",
                        content: item => item.deadline
                      },
                      {
                        id: "requirements",
                        header: "Key Requirements",
                        content: item => (
                          <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            {item.keyRequirements.map((req, i) => (
                              <li key={i}>{req}</li>
                            ))}
                          </ul>
                        )
                      },
                      {
                        id: "actions",
                        content: item => (
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button 
                              iconName="external" 
                              variant="link" 
                              onClick={() => navigateToGrant(item.summaryUrl)}
                            >
                              View Requirements
                            </Button>
                            <Button 
                              iconName="contact" 
                              variant="link" 
                              onClick={() => startChatWithGrant(item.summaryUrl)}
                            >
                              Start Narrative Draft
                            </Button>
                          </SpaceBetween>
                        )
                      }
                    ]
                  }}
                  cardsPerRow={[
                    { cards: 1 },
                    { minWidth: 500, cards: 2 }
                  ]}
                  items={metadata.grantRecommendations}
                  loadingText="Loading grants"
                  visibleSections={["funding", "deadline", "requirements", "actions"]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No matching grants</b>
                      <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                        No grants match your current criteria
                      </Box>
                    </Box>
                  }
                />
              )}
            </>
          ) : (
            <TextContent>
              <strong>{content}</strong>
            </TextContent>
          )}
        </SpaceBetween>
        </Box>
      </div>
    </div>
  );
}