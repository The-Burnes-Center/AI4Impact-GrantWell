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
  
  // Initial pre-defined questions
  const initialQuestions = [
    "What grants are available for renewable energy projects?",
    "I need funding for a transportation infrastructure project",
    "Are there grants available for small rural communities?"
  ];

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
      
      // Call the backend API for a response
      // In the future, this will be replaced with actual API call to get grant recommendations
      await mockAPICall(message);
            
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
    }
    
    setLoading(false);
  };

  // Mock API call - will be replaced with actual API integration
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
    // Create a new welcome message
    const welcomeMessage: Message = {
      type: 'ai',
      content: "I've cleared our conversation. How can I help you find grants today?",
      metadata: {
        suggestedQuestions: initialQuestions
      }
    };

    // Reset messages to just the welcome message
    setMessages([welcomeMessage]);
    
    // Create a new session
    try {
      const userInfo = await Auth.currentAuthenticatedUser();
      const newSession = await SessionManager.createNewSession(userInfo.username);
      setSessionId(newSession.id);
      
      // Update the session with the welcome message
      SessionManager.updateSession([welcomeMessage]);
      
      const id = addNotification("success", "Conversation history cleared");
      Utils.delay(2000).then(() => removeNotification(id));
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  return (
    <Modal
      visible={isOpen}
      onDismiss={handleClose}
      closeAriaLabel="Close"
      size="large"
      header={
        <Header
          variant="h2"
          actions={
            <Button
              iconName="close"
              variant="icon"
              onClick={handleClearChat}
              ariaLabel="Clear chat history"
            />
          }
        >
          Grant Finder Assistant
        </Header>
      }
    >
      <Container>
        <div className="chat-container" style={{ height: '400px', overflowY: 'auto', marginBottom: '10px', padding: '10px' }}>
          {messages.map((message, index) => (
            <Box key={index} margin={{ bottom: 'l' }}>
              <ChatMessageSimple
                message={message}
                navigateToGrant={navigateToGrant}
                startChatWithGrant={startChatWithGrant}
              />
              {message.type === 'ai' && message.metadata?.suggestedQuestions && (
                <SuggestedQuestions
                  questions={message.metadata.suggestedQuestions}
                  onQuestionClick={handleSuggestedQuestionClick}
                />
              )}
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <Box padding={{ top: 's' }}>
          <ChatInputSimple 
            onSendMessage={handleSendMessage} 
            isLoading={loading}
            disabled={loading} 
          />
        </Box>
        
        <Box padding={{ top: 'm' }}>
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <StatusIndicator type="info">
              Find the perfect grant for your needs with our AI-powered grant finder
            </StatusIndicator>
          </SpaceBetween>
        </Box>
      </Container>
    </Modal>
  );
}