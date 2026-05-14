# GrantWell v1.0.0

**Last Updated:** May 13, 2026

GrantWell is an AI-powered grant-writing assistant designed to help users discover, analyze, and apply for state and federal funding opportunities. This is the first stable release of the platform, developed in partnership with the Burnes Center for Social Change and the Massachusetts Federal Funds and Infrastructure Office.

## Highlights

- AI-assisted grant-writing workflow, from opportunity discovery to narrative export
- Automated NOFO ingestion, summarization, and requirements extraction
- Conversational drafting assistant powered by AWS Bedrock (Claude Sonnet 4.6)
- Section-based document editor with progress tracking
- Administrative dashboard for managing opportunities, users, and content of extracted NOFOs

## Features

### Grant Discovery

- Browse and select from the NOFO catalog with keyword search
- Currently supports grants from grants.gov that have NOFOs
- Also supports manual upload of state grants
- Each state can upload grants specific to that state, isolated from other users
- Support for rolling grant deadlines through the `isRolling` flag
- Filters for status, grant type, and category

### Requirements Analysis

- Automated NOFO scraping and metadata extraction. Metadata includes: status, agency, grant type, category, deadline
- AI-generated summaries of eligibility, required documents, narrative sections, and deadlines

### AI Writing Assistant

- Conversational chatbot for drafting grant narratives
- Responses grounded in the selected NOFO and uploaded supporting documents
- Per-user, per-NOFO conversation history with Cognito-backed access control

> **Note:** AI-generated content should always be reviewed and fact-checked before submission.

### Document Editor

- Section-based editor for drafting and refining application narratives
- Progress tracking across application sections
- Export functionality for completed application drafts; supported formats: DOCX and PDF

### Administrative Dashboard

- NOFO management with status, agency, and rolling-deadline fields
- Automated NOFO scraping pipeline from grants.gov
- Admin users can invite new users to the platform by sending them an access link
- Role-based access control for administrative users

## Accessibility

- Conforms to WCAG 2.1 Level AA, including support for screen readers, keyboard navigation, and sufficient color contrast
- Automated accessibility testing completed using Axe

## Security

- AWS Cognito authentication with self-signup
- Role-based access control, including administrative privileges
- Data encrypted in transit and at rest
- File-upload validation in knowledge management, with PDF preferred and ZIP files not supported

## Known Limitations

- The tool is functional but has undergone limited user testing. Please report issues through the in-app feedback form.
- Supplementary documents must be uploaded before starting a chatbot conversation.
- NOFO documents should be named using the actual grant name before upload.
- `.zip` files are not supported.

## Acknowledgments

GrantWell was built by the AI For Impact Team in partnership with the Massachusetts Federal Funds and Infrastructure Office.
