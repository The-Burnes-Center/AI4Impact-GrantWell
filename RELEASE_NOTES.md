# GrantWell v1.5.0

**Last Updated:** July 27, 2026

This release builds on the v1.0.0 foundation with an admin analytics dashboard, grant-opportunity email digests, a rebuilt NOFO processing pipeline, and state-scoped administration. It also adds a one-time profile step so we can better understand who is using the platform.

## Highlights

- New admin **Analytics** dashboard: users per state, popular searches, most viewed and pursued grants, draft creation/completion, and usage by agency
- **Grant opportunity email digests** — daily or weekly, tailored to each user's state, categories, and keywords
- Rebuilt **NOFO processing pipeline** with live progress, a "Needs attention" review queue, and auto-publish for partial extractions
- **State-scoped administration** — state admins manage only their own state's grants, with state-specific overlays on federal opportunities
- One-time **profile completion** (agency, organization, role) and a personal profile page with activity history

## New in this release

### Analytics Dashboard (Admin)

- New **Analytics** tab in the admin dashboard, available to admins and developers
- Metrics: registered and active users per state, most popular search queries, most viewed and most pursued grant opportunities, drafts created / completed / downloaded, and usage by agency
- **Grant application funnel** showing completion versus abandonment across the drafting stages
- Selectable time window (last 7 / 30 / 90 days); developers and platform admins can view all states or filter to one, while state admins see their own state
- Search analytics record only committed searches (on submit), so partial as-you-type queries are not counted

### User Profiles

- One-time profile completion on next sign-in, collecting agency, organization, and role/title (state is shown but assigned by an administrator)
- Personal **Profile** page: manage notification preferences, review recent drafts, chat sessions, and viewed grants, and update organization details

### Grant Opportunity Digests

- Opt-in daily or weekly email digests of new and closing-soon grant opportunities
- Personalized to the user's assigned state, chosen categories, and keywords
- One-click unsubscribe and self-service preferences on the profile page
- Developer tools to preview and broadcast digests

## Improvements

### NOFO Processing

- Live pipeline progress shown directly on grant rows, with processing and quarantined states
- A **"Needs attention"** review queue merged into the Grants tab for grants that need admin review before publishing
- Partial extractions can be auto-published with an advisory review flag rather than blocking
- More robust NOFO content detection and metadata extraction, with graceful degradation when a metric can't be computed

### State-Scoped Administration

- **State admins** can manage only their own state's grants; all NOFO-mutating actions are enforced server-side (fail-closed)
- State-specific guidance **overlays** on federal NOFOs, shown only to that state's users
- Promote-a-federal-NOFO-to-a-state-copy workflow

### User Management

- Admins can create and delete users and manage roles (User, Admin, Developer) and state assignment
- Clearer error handling and messaging in the User Management tab

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
