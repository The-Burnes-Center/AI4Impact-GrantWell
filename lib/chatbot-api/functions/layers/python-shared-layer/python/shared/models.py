"""
Shared Pydantic models for Lambda functions.
These models provide validation and type safety for JSON data structures.
"""

import json
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, List, Any, Literal
from datetime import datetime


class DraftOperationRequest(BaseModel):
    """Request model for draft operations."""
    operation: Literal[
        'add_draft',
        'get_draft',
        'update_draft',
        'list_drafts_by_user_id',
        'list_all_drafts_by_user_id',
        'delete_draft',
        'delete_user_drafts'
    ] = Field(..., description="The operation to perform")
    user_id: str = Field(..., min_length=1, description="User identifier")
    session_id: Optional[str] = Field(None, description="Session identifier")
    sections: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Draft sections")
    title: Optional[str] = Field(None, description="Draft title")
    document_identifier: Optional[str] = Field(None, description="Document identifier")
    project_basics: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Project basics")
    questionnaire: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Questionnaire responses")
    last_modified: Optional[str] = Field(None, description="Last modified timestamp")
    status: Optional[Literal[
        'project_basics',
        'questionnaire',
        'editing_sections'
    ]] = Field(None, description="Draft status")

    @field_validator('session_id')
    @classmethod
    def validate_session_id_for_operations(cls, v, info):
        """Validate session_id is present for operations that require it."""
        operation = info.data.get('operation')
        required_operations = ['add_draft', 'get_draft', 'update_draft', 'delete_draft']
        if operation in required_operations and not v:
            raise ValueError(f'session_id is required for {operation} operation')
        return v


class DraftItem(BaseModel):
    """Model for a draft item stored in DynamoDB."""
    user_id: str
    session_id: str
    title: str
    document_identifier: str
    sections: Dict[str, Any] = Field(default_factory=dict)
    project_basics: Dict[str, Any] = Field(default_factory=dict)
    questionnaire: Dict[str, Any] = Field(default_factory=dict)
    last_modified: str
    status: Literal['project_basics', 'questionnaire', 'editing_sections'] = 'project_basics'


class DraftResponse(BaseModel):
    """Response model for draft operations."""
    sessionId: str
    title: str
    documentIdentifier: str
    lastModified: str
    status: str
    userId: Optional[str] = None
    sections: Optional[Dict[str, Any]] = None
    projectBasics: Optional[Dict[str, Any]] = None
    questionnaire: Optional[Dict[str, Any]] = None


class ChatEntry(BaseModel):
    """Model for a single chat entry."""
    role: Optional[str] = None
    content: Optional[str] = None
    timestamp: Optional[str] = None


class SessionOperationRequest(BaseModel):
    """Request model for session operations."""
    operation: Literal[
        'add_session',
        'get_session',
        'update_session',
        'list_sessions_by_user_id',
        'list_all_sessions_by_user_id',
        'delete_session',
        'delete_user_sessions'
    ] = Field(..., description="The operation to perform")
    user_id: str = Field(..., min_length=1, description="User identifier")
    session_id: Optional[str] = Field(None, description="Session identifier")
    chat_history: Optional[List[Dict[str, Any]]] = Field(None, description="Chat history")
    new_chat_entry: Optional[List[Dict[str, Any]]] = Field(None, description="New chat entry to add")
    title: Optional[str] = Field(None, description="Session title")
    document_identifier: Optional[str] = Field(None, description="Document identifier")

    @field_validator('session_id')
    @classmethod
    def validate_session_id_for_operations(cls, v, info):
        """Validate session_id is present for operations that require it."""
        operation = info.data.get('operation')
        required_operations = ['add_session', 'get_session', 'update_session', 'delete_session']
        if operation in required_operations and not v:
            raise ValueError(f'session_id is required for {operation} operation')
        return v


class SessionItem(BaseModel):
    """Model for a session item stored in DynamoDB."""
    user_id: str
    session_id: str
    title: str
    time_stamp: str
    document_identifier: Optional[str] = None
    chat_history: List[Dict[str, Any]] = Field(default_factory=list)


class FeedbackData(BaseModel):
    """Model for feedback data submitted by users."""
    sessionId: str = Field(..., min_length=1, description="Session identifier")
    prompt: str = Field(..., min_length=1, description="User prompt")
    completion: str = Field(..., description="Chatbot completion")
    feedback: int = Field(..., ge=0, le=1, description="Feedback value (0 or 1)")
    comment: Optional[str] = Field(None, description="Feedback comment")
    topic: Optional[str] = Field(None, description="Feedback topic")
    problem: Optional[str] = Field(None, description="Problem description")
    sources: Optional[List[str]] = Field(default_factory=list, description="Source references")


class PostFeedbackRequest(BaseModel):
    """Request model for posting feedback."""
    feedbackData: FeedbackData


class DownloadFeedbackRequest(BaseModel):
    """Request model for downloading feedback."""
    startTime: str = Field(..., description="Start time for feedback query")
    endTime: str = Field(..., description="End time for feedback query")
    topic: Optional[str] = Field(None, description="Filter by topic")


class FeedbackItem(BaseModel):
    """Model for a feedback item stored in DynamoDB."""
    FeedbackID: str
    SessionID: str
    UserPrompt: str
    FeedbackComments: str
    Topic: str
    Problem: str
    Feedback: int
    ChatbotMessage: str
    Sources: List[str]
    CreatedAt: str
    Any: str = "YES"


class FeedbackQueryParams(BaseModel):
    """Query parameters for getting feedback."""
    startTime: str = Field(..., description="Start time for feedback query")
    endTime: str = Field(..., description="End time for feedback query")
    topic: Optional[str] = Field(None, description="Filter by topic")
    nextPageToken: Optional[str] = Field(None, description="Pagination token")


class FeedbackDeleteParams(BaseModel):
    """Query parameters for deleting feedback."""
    topic: str = Field(..., description="Topic of feedback to delete")
    createdAt: str = Field(..., description="Created timestamp of feedback to delete")


class DeleteS3Request(BaseModel):
    """Request model for deleting S3 objects."""
    KEY: str = Field(..., min_length=1, description="S3 object key")


def parse_lambda_event_body(event: Dict[str, Any], model_class: type[BaseModel]) -> BaseModel:
    """
    Parse and validate Lambda event body using a Pydantic model.
    
    Args:
        event: Lambda event dictionary
        model_class: Pydantic model class to validate against
        
    Returns:
        Validated model instance
        
    Raises:
        ValueError: If body is missing or invalid JSON
        ValidationError: If data doesn't match model schema
    """
    if 'body' not in event:
        raise ValueError("Event body is missing")
    
    try:
        body_data = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        return model_class(**body_data)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in request body: {e}")


def parse_query_params(event: Dict[str, Any], model_class: type[BaseModel]) -> BaseModel:
    """
    Parse and validate Lambda event query parameters using a Pydantic model.
    
    Args:
        event: Lambda event dictionary
        model_class: Pydantic model class to validate against
        
    Returns:
        Validated model instance
        
    Raises:
        ValidationError: If data doesn't match model schema
    """
    query_params = event.get('queryStringParameters', {}) or {}
    return model_class(**query_params)
