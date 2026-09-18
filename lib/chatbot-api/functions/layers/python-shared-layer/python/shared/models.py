"""
Shared Pydantic models for Lambda functions.
These models provide validation and type safety for JSON data structures.
"""

import json
from pydantic import BaseModel, Field, model_validator
from typing import Optional, Dict, List, Any, ClassVar, Literal
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
        'create_draft_version',
        'mark_step_reached'
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
    reached_step: Optional[Literal[
        'projectBasics',
        'questionnaire',
        'uploadDocuments',
        'sectionEditor',
        'reviewApplication'
    ]] = Field(None, description="Wizard step the user has now reached; recorded as a high-water mark")
    limit: Optional[int] = Field(None, ge=1, le=200, description="Max version rows to return")

    SESSION_ID_OPERATIONS: ClassVar[frozenset] = frozenset({
        'add_draft', 'get_draft', 'update_draft', 'delete_draft',
        'list_draft_versions', 'get_draft_version', 'restore_draft_version',
        'label_draft_version', 'create_draft_version', 'mark_step_reached',
    })

    REV_OPERATIONS: ClassVar[frozenset] = frozenset({
        'get_draft_version', 'restore_draft_version', 'label_draft_version',
    })

    @model_validator(mode='after')
    def validate_required_fields_for_operation(self):
        """Model-level: a field validator is skipped for an omitted value, which failed as a 500."""
        if self.operation in self.SESSION_ID_OPERATIONS and not self.session_id:
            raise ValueError(f'session_id is required for {self.operation} operation')
        if self.operation in self.REV_OPERATIONS and self.rev is None:
            raise ValueError(f'rev is required for {self.operation} operation')
        if self.operation == 'mark_step_reached' and not self.reached_step:
            raise ValueError('reached_step is required for mark_step_reached operation')
        return self


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
    reached_steps: List[str] = Field(default_factory=list)
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

    SESSION_ID_OPERATIONS: ClassVar[frozenset] = frozenset({
        'add_session', 'get_session', 'update_session', 'delete_session',
    })

    @model_validator(mode='after')
    def validate_required_fields_for_operation(self):
        if self.operation in self.SESSION_ID_OPERATIONS and not self.session_id:
            raise ValueError(f'session_id is required for {self.operation} operation')
        return self


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
