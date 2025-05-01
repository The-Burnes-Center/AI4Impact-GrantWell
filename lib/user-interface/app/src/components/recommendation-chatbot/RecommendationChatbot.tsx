import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  Box,
  Button, 
  Container, 
  Header,
  SpaceBetween,
  Modal,
  StatusIndicator
} from '@cloudscape-design/components';
import { Auth } from 'aws-amplify';
import { AppContext } from '../../common/app-context';
import { ApiClient } from '../../common/api-client/api-client';
import { useNotifications } from '../notif-manager';
import { Utils } from '../../common/utils';
import SuggestedQuestions from './SuggestedQuestions';
import ChatMessageSimple from './ChatMessageSimple';
import ChatInputSimple from './ChatInputSimple';
import { SessionManager } from './SessionManager';
import '../../styles/recommendation-chatbot.css';

// Define types for our chatbot
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

// Define WebSocket readyState constants to replace the ones from react-use-websocket
enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
  UNINSTANTIATED = -1,
}

interface RecommendationChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RecommendationChatbot({ isOpen, onClose }: RecommendationChatbotProps) {
  // Contexts and hooks
  const appContext = useContext(AppContext);
  const navigate = useNavigate();
  const { addNotification, removeNotification } = useNotifications();
  const apiClient = new ApiClient(appContext);
  
  // State variables
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(uuidv4());
  const [username, setUsername] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string>('');
  
  // WebSocket state
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.UNINSTANTIATED);
  const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  
  // Initial pre-defined questions
  const initialQuestions = [
    "What grants are available for renewable energy projects?",
    "I need funding for a transportation infrastructure project",
    "Are there grants available for small rural communities?"
  ];

  // Handle WebSocket connection and authentication
  useEffect(() => {
    let ws: WebSocket | null = null;
    
    const setupWebSocket = async () => {
      try {
        // Get the JWT token for WebSocket authentication
        const session = await Auth.currentSession();
        const jwtToken = session.getIdToken().getJwtToken();
        setToken(jwtToken);
        
        // Create WebSocket connection
        const wsUrl = `${appContext?.wsEndpoint}?Authorization=${encodeURIComponent(jwtToken)}`;
        ws = new WebSocket(wsUrl);
        setWebSocket(ws);
        webSocketRef.current = ws;
        
        // Set up WebSocket event handlers
        ws.addEventListener('open', () => {
          console.log('WebSocket connection established');
          setReadyState(ReadyState.OPEN);
        });
        
        ws.addEventListener('close', () => {
          console.log('WebSocket connection closed');
          setReadyState(ReadyState.CLOSED);
          
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (isOpen) {
              setupWebSocket();
            }
          }, 3000);
        });
        
        ws.addEventListener('error', (event) => {
          console.error('WebSocket error:', event);
          setReadyState(ReadyState.CLOSED);
        });
        
        ws.addEventListener('message', (event) => {
          try {
            const wsResponse = JSON.parse(event.data);
            
            // Handle different types of responses
            if (wsResponse.type === 'processing') {
              // Show processing message
              console.log('Processing request:', wsResponse.message);
            } else if (wsResponse.type === 'ai' || wsResponse.type === 'grantRecommendations') {
              // Replace the loading message with the actual recommendations
              setMessages(prev => [
                ...prev.slice(0, -1),
                {
                  type: 'ai',
                  content: wsResponse.content || "Here are some grant opportunities that match your criteria:",
                  metadata: {
                    grantRecommendations: wsResponse.metadata?.grantRecommendations || wsResponse.recommendations,
                    suggestedQuestions: wsResponse.metadata?.suggestedQuestions || wsResponse.suggestedQuestions || []
                  }
                }
              ]);
              setLoading(false);
            } else if (wsResponse.type === 'error') {
              // Handle error responses
              setMessages(prev => [
                ...prev.slice(0, -1),
                {
                  type: 'ai',
                  content: "I'm having trouble finding matching grants. Please try again or refine your search."
                }
              ]);
              setLoading(false);
              
              const id = addNotification("error", "Failed to get recommendations: " + wsResponse.message);
              Utils.delay(3000).then(() => removeNotification(id));
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            
            // Handle parsing error
            setMessages(prev => [
              ...prev.slice(0, -1),
              {
                type: 'ai',
                content: "I encountered an error processing your request. Please try again."
              }
            ]);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        setReadyState(ReadyState.CLOSED);
      }
    };

    if (isOpen && !ws) {
      setupWebSocket();
    }

    // Cleanup function
    return () => {
      if (ws && (ws.readyState === ReadyState.OPEN || ws.readyState === ReadyState.CONNECTING)) {
        ws.close();
      }
    };
  }, [isOpen, appContext?.wsEndpoint]);

  // Load or initialize chat session when the chatbot opens
  useEffect(() => {
    if (isOpen) {
      const loadSession = async () => {
        try {
          // Get user info
          const userInfo = await Auth.currentAuthenticatedUser();
          setUsername(userInfo.username);
          
          // Get current session
          const session = await SessionManager.getCurrentSession();
          setSessionId(session.id);
          
          // If we have existing messages, load them
          if (session.messages && session.messages.length > 0) {
            setMessages(session.messages);
          } else {
            // Otherwise, start with welcome message
            const welcomeMessage: Message = {
              type: 'ai',
              content: "👋 Hello! I'm your GrantWell Assistant. I can help you find grants that match your needs. What type of project or funding are you looking for?",
              metadata: {
                suggestedQuestions: initialQuestions
              }
            };
            setMessages([welcomeMessage]);
          }
        } catch (error) {
          console.error("Error loading session:", error);
          // Fallback to initial message if there's an error
          const welcomeMessage: Message = {
            type: 'ai',
            content: "👋 Hello! I'm your GrantWell Assistant. I can help you find grants that match your needs. What type of project or funding are you looking for?",
            metadata: {
              suggestedQuestions: initialQuestions
            }
          };
          setMessages([welcomeMessage]);
        }
      };
      
      loadSession();
    }
  }, [isOpen]);

  // Save messages when they change
  useEffect(() => {
    if (messages.length > 0) {
      SessionManager.updateSession(messages);
    }
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Function to send a message using raw WebSocket
  const sendWebSocketMessage = (action: string, data: any) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== ReadyState.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    const message = JSON.stringify({
      action,
      data
    });
    
    webSocketRef.current.send(message);
  };

  // Handle user message submission
  const handleSendMessage = async (message: string) => {
    if (message.trim() === '') return;
    
    // Add user message to chat
    const userMessage: Message = {
      type: 'human',
      content: message
    };
    
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    
    try {
      // Create a new message to show loading state
      const loadingMessage: Message = {
        type: 'ai',
        content: '...'
      };
      setMessages(prev => [...prev, loadingMessage]);
      
      // Check WebSocket connection status
      if (!webSocketRef.current || webSocketRef.current.readyState !== ReadyState.OPEN) {
        throw new Error('WebSocket not connected');
      }
      
      // Send the request for grant recommendations
      sendWebSocketMessage('getGrantRecommendations', {
        query: message,
        user_id: username,
        session_id: sessionId,
        preferences: {} // Optional user preferences can be added here
      });
      
      // If WebSocket is not responding after a timeout, fall back to mock data
      const timeoutId = setTimeout(() => {
        if (loading) {
          console.warn('WebSocket response timeout, falling back to mock data');
          mockAPICall(message);
        }
      }, 8000);
      
      return () => clearTimeout(timeoutId);
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Update the loading message with an error
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          type: 'ai',
          content: "Sorry, I'm having trouble processing your request right now. Please try again later."
        }
      ]);
      
      const id = addNotification("error", "Failed to get a response. Please try again.");
      Utils.delay(3000).then(() => removeNotification(id));
      setLoading(false);
    }
  };

  // Mock API call - used as a fallback if the WebSocket fails
  const mockAPICall = async (message: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // For demo purposes, generate contextual response based on user message
    const keywords = message.toLowerCase();
    
    let response: Message;
    
    if (keywords.includes('infrastructure') || keywords.includes('transportation') || keywords.includes('road')) {
      response = {
        type: 'ai',
        content: "Based on your interest in infrastructure, here are some grant opportunities that might be a good match:",
        metadata: {
          grantRecommendations: [
            {
              id: "RAISE-2025",
              name: "Rebuilding American Infrastructure with Sustainability and Equity (RAISE)",
              matchScore: 92,
              eligibilityMatch: true,
              fundingAmount: "$1-25 million",
              deadline: "April 30, 2025",
              keyRequirements: ["State/local government applicants", "Project readiness documentation", "Benefit-cost analysis"],
              summaryUrl: "RAISE/"
            },
            {
              id: "INFRA-2025",
              name: "Infrastructure for Rebuilding America (INFRA)",
              matchScore: 85,
              eligibilityMatch: true,
              fundingAmount: "$5-100 million",
              deadline: "May 15, 2025",
              keyRequirements: ["Minimum project size: $5 million", "Highway or freight projects", "Environmental approvals"],
              summaryUrl: "INFRA/"
            }
          ],
          suggestedQuestions: [
            "What are the eligibility requirements for RAISE grants?",
            "How do I prepare a benefit-cost analysis?",
            "What's the timeline for INFRA applications?"
          ]
        }
      };
    } else if (keywords.includes('renewable') || keywords.includes('energy') || keywords.includes('solar') || keywords.includes('climate')) {
      response = {
        type: 'ai',
        content: "I found several grants related to renewable energy and climate initiatives:",
        metadata: {
          grantRecommendations: [
            {
              id: "CERI-2025",
              name: "Clean Energy Research Initiative",
              matchScore: 94,
              eligibilityMatch: true,
              fundingAmount: "$500,000-2 million",
              deadline: "June 12, 2025",
              keyRequirements: ["Technology innovation component", "Emissions reduction metrics", "Community engagement plan"],
              summaryUrl: "CERI/"
            },
            {
              id: "CCUS-2025",
              name: "Carbon Capture Utilization and Storage",
              matchScore: 76,
              eligibilityMatch: true,
              fundingAmount: "$2-15 million",
              deadline: "August 3, 2025",
              keyRequirements: ["Technical feasibility study", "Environmental impact assessment", "Public-private partnership"],
              summaryUrl: "CCUS/"
            }
          ],
          suggestedQuestions: [
            "What technology areas qualify for the Clean Energy Research Initiative?",
            "Do I need matching funds for these grants?",
            "Can municipalities apply for CCUS grants?"
          ]
        }
      };
    } else if (keywords.includes('rural') || keywords.includes('community') || keywords.includes('small town')) {
      response = {
        type: 'ai',
        content: "For rural communities, these grants might be particularly relevant:",
        metadata: {
          grantRecommendations: [
            {
              id: "RCDI-2025",
              name: "Rural Community Development Initiative",
              matchScore: 97,
              eligibilityMatch: true,
              fundingAmount: "$50,000-250,000",
              deadline: "May 22, 2025",
              keyRequirements: ["Population under 50,000", "Technical assistance component", "Community support documentation"],
              summaryUrl: "RCDI/"
            },
            {
              id: "RDUL-2025",
              name: "Rural Development Utilities Loans",
              matchScore: 82,
              eligibilityMatch: true,
              fundingAmount: "$100,000-3 million",
              deadline: "Rolling applications",
              keyRequirements: ["Critical infrastructure focus", "Underserved community benefit", "Economic impact analysis"],
              summaryUrl: "RDUL/"
            }
          ],
          suggestedQuestions: [
            "What qualifies as a rural community for these grants?",
            "How competitive is the RCDI program?",
            "Can these funds be used for planning or only implementation?"
          ]
        }
      };
    } else if (keywords.includes('education') || keywords.includes('school') || keywords.includes('student') || keywords.includes('learning')) {
      response = {
        type: 'ai',
        content: "Here are some education-focused grant opportunities that might interest you:",
        metadata: {
          grantRecommendations: [
            {
              id: "EIR-2025",
              name: "Education Innovation and Research",
              matchScore: 89,
              eligibilityMatch: true,
              fundingAmount: "$300,000-4 million",
              deadline: "July 7, 2025",
              keyRequirements: ["Evidence-based approach", "Student achievement focus", "Rigorous evaluation plan"],
              summaryUrl: "EIR/"
            },
            {
              id: "SEED-2025",
              name: "Supporting Effective Educator Development",
              matchScore: 78,
              eligibilityMatch: true,
              fundingAmount: "$500,000-2 million",
              deadline: "June 30, 2025",
              keyRequirements: ["Teacher development program", "Evidence of effectiveness", "Sustainability plan"],
              summaryUrl: "SEED/"
            }
          ],
          suggestedQuestions: [
            "What kinds of projects qualify for Education Innovation grants?",
            "How do I demonstrate evidence of effectiveness?",
            "Do SEED grants require matching funds?"
          ]
        }
      };
    } else {
      response = {
        type: 'ai',
        content: "I'd be happy to help you find relevant grants. Could you provide more details about your project or specific area of interest? This will help me make better recommendations.",
        metadata: {
          suggestedQuestions: [
            "What grants are available for education programs?",
            "I'm looking for healthcare facility funding",
            "Are there grants for environmental conservation projects?"
          ]
        }
      };
    }
    
    // Update the messages array, replacing the loading message
    setMessages(prev => [...prev.slice(0, -1), response]);
  };

  // Handle clicking on a suggested question
  const handleSuggestedQuestionClick = (question: string) => {
    handleSendMessage(question);
  };

  // Handle navigation to grant details
  const navigateToGrant = (summaryUrl: string) => {
    navigate(`/landing-page/basePage/checklists/${encodeURIComponent(summaryUrl)}`);
    onClose();
  };

  // Handle starting a new chat session with a specific grant
  const startChatWithGrant = (summaryUrl: string) => {
    navigate(`/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(summaryUrl)}`);
    onClose();
  };

  // Handle closing the chatbot
  const handleClose = () => {
    // Save the current session before closing
    SessionManager.updateSession(messages);
    onClose();
  };

  // Handle clearing the chat history
  const handleClearChat = async () => {
    // Create a new session ID
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    
    // Create a new welcome message with initial suggested questions
    const welcomeMessage: Message = {
      type: 'ai',
      content: "👋 Hello! I'm your GrantWell Assistant. I can help you find grants that match your needs. What type of project or funding are you looking for?",
      metadata: {
        suggestedQuestions: initialQuestions
      }
    };

    // Reset messages to just the welcome message
    setMessages([welcomeMessage]);
    
    // Create a new session
    try {
      const userInfo = await Auth.currentAuthenticatedUser();
      setUsername(userInfo.username);
      
      // Create new session
      await SessionManager.createNewSession(userInfo.username);
      
      // Update the session with the welcome message
      SessionManager.updateSession([welcomeMessage]);
      
      const id = addNotification("success", "Started a new conversation");
      Utils.delay(2000).then(() => removeNotification(id));
    } catch (error) {
      console.error("Error clearing chat:", error);
      const id = addNotification("error", "Error creating new session");
      Utils.delay(2000).then(() => removeNotification(id));
    }
  };

  // Get connection status text
  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Open",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Closed",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  return (
    <Modal
      visible={isOpen}
      onDismiss={handleClose}
      closeAriaLabel="Close"
      size="large"
      header={
        <Header variant="h2">
          Grant Recommendation Assistant
          <span style={{ fontSize: '14px', fontWeight: 'normal', marginLeft: '10px' }}>
            {connectionStatus === "Open" ? (
              <StatusIndicator type="success">Connected</StatusIndicator>
            ) : (
              <StatusIndicator type="error">Disconnected</StatusIndicator>
            )}
          </span>
        </Header>
      }
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleClearChat} disabled={loading || messages.length <= 1}>
              Clear Chat
            </Button>
            <Button onClick={handleClose} variant="primary">
              Close
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
        {/* Chat messages */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '16px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px' 
        }}>
          {messages.map((message, index) => (
            <ChatMessageSimple 
              key={index} 
              message={message} 
              onGrantClick={navigateToGrant}
              onStartChatClick={startChatWithGrant}
            />
          ))}
          
          {/* Empty div for scroll reference */}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Connection status when disconnected */}
        {connectionStatus !== "Open" && (
          <div style={{ padding: '8px', backgroundColor: '#fdf3f3', textAlign: 'center', fontSize: '14px' }}>
            WebSocket {connectionStatus.toLowerCase()} - {connectionStatus === "Connecting" ? "Connecting to server..." : "Connection lost. Trying to reconnect..."}
          </div>
        )}
        
        {/* Input area */}
        <ChatInputSimple 
          onSendMessage={handleSendMessage} 
          isLoading={loading}
          disabled={readyState !== ReadyState.OPEN || loading} 
        />
        
        {/* Suggested questions */}
        {messages.length > 0 && messages[messages.length - 1].type === 'ai' && messages[messages.length - 1].metadata?.suggestedQuestions?.length > 0 && (
          <SuggestedQuestions 
            questions={messages[messages.length - 1].metadata.suggestedQuestions} 
            onQuestionClick={handleSuggestedQuestionClick}
            disabled={loading}
          />
        )}
      </div>
    </Modal>
  );
}