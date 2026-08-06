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
        'delete_user_drafts',
        'list_draft_versions',
        'get_draft_version',
        'restore_draft_version',
        'label_draft_version',
        'create_draft_version'
    ] = Field(..., description="The operation to perform")
    user_id: str = Field(..., min_length=1, description="User identifier")
    session_id: Optional[str] = Field(None, description="Session identifier")
    # These default to None, not {}, so an update that omits a field leaves the
    # stored value alone; an explicit {} still clears it.
    sections: Optional[Dict[str, Any]] = Field(None, description="Draft sections")
    title: Optional[str] = Field(None, description="Draft title")
    document_identifier: Optional[str] = Field(None, description="Document identifier")
    project_basics: Optional[Dict[str, Any]] = Field(None, description="Project basics")
    questionnaire: Optional[Dict[str, Any]] = Field(None, description="Questionnaire responses")
    additional_info: Optional[str] = Field(None, description="Free-text extra context supplied by the applicant")
    uploaded_files: Optional[List[Dict[str, Any]]] = Field(None, description="Metadata for supporting documents")
    last_modified: Optional[str] = Field(None, description="Last modified timestamp")
    status: Optional[Literal[
        'project_basics',
        'questionnaire',
        'uploading_documents',
        'generating_draft',
        'editing_sections',
        'reviewing',
        'submitted'
    ]] = Field(None, description="Draft status")
    expected_rev: Optional[int] = Field(None, ge=0, description="Expected current revision; makes the update conditional")
    last_write_source: Optional[Literal[
        'autosave',
        'ai_generated',
        'ai_regenerated',
        'manual',
        'restore',
        'status_change'
    ]] = Field(None, description="Attribution for the write, read by the version-writer stream consumer")
    rev: Optional[int] = Field(None, ge=0, description="Version revision to read, restore or label")
    label: Optional[str] = Field(None, max_length=120, description="Human label for a saved version")
    sections_only: Optional[List[str]] = Field(None, description="Restore just these section names")
    limit: Optional[int] = Field(None, ge=1, le=200, description="Max version rows to return")

    @field_validator('session_id')
    @classmethod
    def validate_session_id_for_operations(cls, v, info):
        """Validate session_id is present for operations that require it."""
        operation = info.data.get('operation')
        required_operations = [
            'add_draft', 'get_draft', 'update_draft', 'delete_draft',
            'list_draft_versions', 'get_draft_version', 'restore_draft_version',
            'label_draft_version', 'create_draft_version',
        ]
        if operation in required_operations and not v:
            raise ValueError(f'session_id is required for {operation} operation')
        return v

    @field_validator('rev')
    @classmethod
    def validate_rev_for_operations(cls, v, info):
        """Validate rev is present for operations that address one revision."""
        operation = info.data.get('operation')
        if operation in ['get_draft_version', 'restore_draft_version', 'label_draft_version'] and v is None:
            raise ValueError(f'rev is required for {operation} operation')
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
    additional_info: Optional[str] = None
    uploaded_files: List[Dict[str, Any]] = Field(default_factory=list)
    last_modified: str
    rev: int = 1
    last_write_source: Optional[str] = None
    status: Literal[
        'project_basics',
        'questionnaire',
        'uploading_documents',
        'generating_draft',
        'editing_sections',
        'reviewing',
        'submitted'
    ] = 'project_basics'


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
    additionalInfo: Optional[str] = None
    uploadedFiles: Optional[List[Dict[str, Any]]] = None
    rev: Optional[int] = None


class DraftVersionMeta(BaseModel):
    """Metadata row for one draft snapshot. See shared.draft_versions for the
    meaning of `rev` and `source`."""
    rev: int
    created_at: str
    source: Optional[str] = None
    label: Optional[str] = None
    changed_sections: List[str] = Field(default_factory=list)
    section_word_counts: Dict[str, int] = Field(default_factory=dict)
    total_word_count: int = 0
    oversize: bool = False


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
