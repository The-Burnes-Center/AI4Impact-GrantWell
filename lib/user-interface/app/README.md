# GrantWell UI Application

A React-based user interface for the GrantWell grant application management system.

## Table of Contents

- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Component Guidelines](#component-guidelines)
- [Styling](#styling)
- [State Management](#state-management)
- [API Integration](#api-integration)
- [Contributing](#contributing)

---

## Project Structure

```
src/
├── app.tsx                 # Main application with routing
├── main.tsx               # Application entry point
├── global.d.ts            # TypeScript declarations
│
├── components/            # Reusable components
│   ├── ui/               # Shared UI primitives (Button, Card, etc.)
│   ├── auth/             # Authentication components
│   ├── chatbot/          # AI chatbot components
│   ├── common/           # Common utilities (Modal, etc.)
│   ├── document-editor/  # Document editing components
│   └── search/           # Search functionality
│
├── pages/                 # Page-level components
│   ├── auth/             # Login/signup pages
│   ├── chatbot/          # Chatbot interface pages
│   ├── Dashboard/        # Main dashboard
│   ├── document-editor/  # Grant application editor
│   ├── landing-page/     # Home/landing page
│   └── requirements-gathering/  # Requirements checklists
│
├── common/                # Shared utilities and types
│   ├── api-client/       # API client classes
│   ├── helpers/          # Helper functions
│   └── *.ts              # Shared types, constants, contexts
│
├── hooks/                 # Custom React hooks
│
├── styles/               # Global and shared stylesheets
│   ├── app.scss          # Main application styles
│   └── *.css             # Component-specific styles
│
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Build theme components
npm run build:theme

# Start development server
npm run dev
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## Architecture

### Component Hierarchy

```
App
├── BaseAppLayout (navigation, header)
│   ├── UnifiedNavigation (sidebar navigation)
│   ├── MDSHeader (top header bar)
│   └── Page Content
│       ├── Dashboard
│       ├── DocumentEditor
│       ├── Chatbot
│       └── ...
└── Auth Pages (unauthenticated routes)
```

### Routing

Routes are defined in `app.tsx`. The application uses React Router v6:

- `/` - Landing page
- `/dashboard` - Main dashboard
- `/chatbot/*` - AI chatbot interface
- `/document-editor/*` - Grant application editor
- `/login`, `/signup` - Authentication

### Authentication

Authentication is handled via AWS Amplify:

```tsx
import { Auth, Hub } from 'aws-amplify';

// Check auth state
const user = await Auth.currentAuthenticatedUser();

// Listen for auth events
Hub.listen('auth', (data) => {
  switch (data.payload.event) {
    case 'signIn':
    case 'signOut':
      // Handle auth changes
  }
});
```

---

## Component Guidelines

### Using Shared UI Components

Always use components from `src/components/ui/` for consistency:

```tsx
import { Button, Card, LoadingSpinner, NavigationButtons } from '../components/ui';

// Example usage
<Card header="Project Details">
  <FormField label="Name" name="name" value={name} onChange={setName} />
  <Button onClick={handleSubmit}>Save</Button>
</Card>
```

See `src/components/ui/README.md` for full component documentation.

### Creating New Components

1. **Location**: Place in appropriate folder:
   - `components/ui/` - Reusable primitives
   - `components/[feature]/` - Feature-specific components
   - `pages/[route]/` - Page components

2. **Structure**:
```tsx
/**
 * ComponentName
 * 
 * Brief description of what the component does.
 * 
 * @example
 * <ComponentName prop1="value" />
 */
import React from 'react';

interface ComponentNameProps {
  /** Prop description */
  prop1: string;
}

const ComponentName: React.FC<ComponentNameProps> = ({ prop1 }) => {
  return <div>{prop1}</div>;
};

export default ComponentName;
```

3. **Best Practices**:
   - Use TypeScript interfaces for props
   - Include JSDoc comments
   - Use shared UI components where possible
   - Follow accessibility guidelines

---

## Styling

### Design Tokens

Use centralized design tokens from `src/components/ui/styles.ts`:

```tsx
import { colors, typography, spacing, borderRadius, shadows } from '../components/ui';

const style = {
  color: colors.primary,
  fontSize: typography.fontSize.base,
  padding: spacing.lg,
  borderRadius: borderRadius.md,
};
```

### Available Tokens

| Category | Examples |
|----------|----------|
| Colors | `colors.primary`, `colors.error`, `colors.text`, `colors.border` |
| Typography | `typography.fontSize.base`, `typography.fontWeight.medium` |
| Spacing | `spacing.sm` (8px), `spacing.lg` (16px), `spacing['2xl']` (24px) |
| Borders | `borderRadius.md` (6px), `borderRadius.lg` (8px) |
| Shadows | `shadows.sm`, `shadows.md`, `shadows.lg` |

### CSS Files

Global styles are in `src/styles/`:

- `app.scss` - Main application styles
- `auth-page.css` - Authentication pages
- `base-page.css` - Landing page base styles
- `document-editor.css` - Editor-specific styles


## State Management

### Local State

Use React hooks for component-local state:

```tsx
const [value, setValue] = useState('');
const [data, setData] = useState<DataType | null>(null);
```

### Context

For shared state, use React Context:

```tsx
import { AppContext } from '../common/app-context';
import { SessionRefreshContext } from '../common/session-refresh-context';

// In component
const appContext = useContext(AppContext);
const { refreshSession } = useContext(SessionRefreshContext);
```

### Data Persistence

For form data persistence:

```tsx
// Auto-save pattern
const autoSave = useCallback((data) => {
  // Save to localStorage immediately
  localStorage.setItem('formKey', JSON.stringify(data));
  
  // Also save to backend
  await onUpdateData({ formData: data });
}, [onUpdateData]);
```

---

## API Integration

### API Client

API calls are centralized in `src/common/api-client/`:

```tsx
import { ApiClient } from '../common/api-client/api-client';

const appContext = useContext(AppContext);
const apiClient = new ApiClient(appContext);

// Example: Fetch NOFO data
const result = await apiClient.landingPage.getNOFOQuestions(nofoId);

// Example: Save draft
await apiClient.drafts.saveDraft(sessionId, draftData);
```

### Client Modules

| Client | Purpose |
|--------|---------|
| `landingPage` | NOFO and grant listings |
| `drafts` | Draft management |
| `sessions` | Session management |
| `knowledgeManagement` | Document/knowledge base |
| `userManagement` | User operations |

---

## Contributing

### Code Style

- Use TypeScript for all new code
- Follow ESLint/Prettier configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Follow conventional commits:

```
feat: add new component
fix: resolve form validation bug
refactor: extract shared button styles
docs: update README
```
---

## Accessibility

All components should meet WCAG 2.1 Level AA:

- Use semantic HTML elements
- Include ARIA labels where needed
- Ensure keyboard navigation
- Maintain color contrast (4.5:1 minimum)
- Provide error messages with `role="alert"`
- Support screen readers

```tsx
// Good example
<button
  onClick={handleSubmit}
  aria-label="Submit form"
  aria-disabled={isLoading}
>
  {isLoading ? <LoadingSpinner size="sm" /> : 'Submit'}
</button>
```

---

## Support

For questions or issues, contact the development team.
