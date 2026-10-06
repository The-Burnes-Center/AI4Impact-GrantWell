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
- [Accessibility](#accessibility)
- [Support](#support)

---

## Project Structure

```
src/
├── App.tsx                # Authenticated routes
├── main.tsx               # Entry point (mounts AppConfigured)
├── global.d.ts            # Build-time globals (__TURNSTILE_SITE_KEY__, etc.)
│
├── components/
│   ├── AppConfigured.tsx # Loads aws-exports.json, configures Amplify, app shell + unauthenticated routes
│   ├── MaintenanceGate.tsx
│   ├── ui/               # Shared UI primitives (Button, Card, etc.)
│   ├── auth/             # Sign-in/sign-up/MFA panel and steps, Turnstile
│   ├── chat/             # AI chatbot components
│   ├── common/           # Modals, Breadcrumbs, ErrorBoundary, FeedbackModal
│   ├── document-editor/  # Version history, diff, progress stepper
│   ├── navigation/       # AppSidebar, UnifiedNavigation, NavigationProvider
│   ├── notifications/    # NotificationProvider, NotificationBar
│   ├── access-denied/
│   ├── profile-gate/
│   └── search/
│
├── layouts/               # ChatLayout
│
├── pages/
│   ├── chat/             # playground/, sessions/
│   ├── dashboard/        # Admin dashboard (/admin)
│   ├── document-editor/  # Grant application editor
│   ├── home/             # Grant finder (/home)
│   ├── landing/          # Public landing + login, chrome.tsx (header/nav/footer)
│   ├── maintenance/
│   ├── profile/
│   └── requirements/     # Requirements checklists
│
├── common/
│   ├── api-client/       # API client classes
│   ├── helpers/          # Helper functions
│   ├── types/
│   ├── generated/        # instance.json (branding + states) staged by packages/core at synth (gitignored)
│   └── *.ts / *.tsx      # Contexts, branding, constants
│
├── hooks/                 # Custom React hooks
│
└── styles/               # tokens.css, app.scss, bootstrap-subset.scss, *.css
```

---

## Getting Started

### Prerequisites

- Node.js 24 (matches CI; react-router 7 requires 20+)
- npm

### Installation

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev
```

`npm run dev` needs an `aws-exports.json` in this directory (gitignored). Copy it from a deployed
site (`https://<site>/aws-exports.json`) and set `oauth.redirectSignIn`/`redirectSignOut` to
`http://localhost:3000/`. Without a staged `src/common/generated/instance.json` it shows neutral
branding; `npm run stage-instance dev` (or `prod`) copies the one from the last `npm run synth:ci`
in packages/core (after `scripts/pack.sh --dev` at the repo root).

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Type-check (`tsc`) and build for production |
| `npm run build:dev` | Same, with `NODE_ENV=development` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint (incl. jsx-a11y strict) |
| `npm run lint:strict` | ESLint, fails on any warning |
| `npm run lint:fix` | ESLint with autofix |
| `npm run lint:colors` | Flag new off-palette colors (`-- --base origin/main` checks what CI checks) |
| `npm run stage-instance <dev\|prod>` | Copy that deployment's `instance.json` from the last `synth:ci` into `src/common/generated/` |
| `npm run format` | Prettier over tsx/js/ts/json |

---

## Architecture

### Component Hierarchy

```
AppConfigured (loads aws-exports.json, BrandingProvider, router)
├── Authenticated shell (NavigationProvider)
│   ├── AppNavbar                (pages/landing/chrome)
│   ├── AppSidebar               (components/navigation/UnifiedNavigation)
│   ├── ProfileGate → MaintenanceGate
│   │   ├── MfaPrompt
│   │   └── App (routes)
│   │       ├── HomePage, Checklists, DocumentEditor, Dashboard, ProfilePage, ...
│   │       └── Playground (layouts/ChatLayout, whose default export is named BaseAppLayout)
│   ├── LandingFooter            (pages/landing/chrome)
│   └── OmniHeader position="bottom" (pages/landing/chrome)
└── Unauthenticated routes: LandingPage, LoginPage (render their own chrome header/footer)
```

Pages render `<UnifiedNavigation ... />`, which renders nothing; it registers the page's step state
with the sidebar through `NavigationProvider`.

### Routing

The application uses React Router v7. Unauthenticated routes live in
`components/AppConfigured.tsx`, authenticated ones in `App.tsx`.

Unauthenticated:

- `/` - Landing page
- `/login` - Sign in / sign up / MFA (`components/auth/AuthPanel`)

Authenticated:

- `/home` - Grant finder (`/` redirects here)
- `/requirements/:documentIdentifier` - Requirements checklist
- `/chat/:sessionId`, `/chat/sessions` - AI chatbot and chat history
- `/document-editor`, `/document-editor/:sessionId`, `/document-editor/drafts` - Grant application editor and drafts
- `/profile` - User profile
- `/admin` - Admin dashboard

### Authentication

Authentication uses AWS Amplify v6 (Cognito). `AppConfigured` loads `/aws-exports.json` at runtime
and calls `Amplify.configure`; the sign-in UI is the custom `components/auth/AuthPanel`.

```tsx
import { getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

// Check auth state
const user = await getCurrentUser();

// Listen for auth events
Hub.listen('auth', ({ payload }) => {
  switch (payload.event) {
    case 'signedIn':
    case 'signedOut':
      // Handle auth changes
  }
});
```

API calls get their bearer token from `Utils.authenticate()` (`common/utils.ts`).

---

## Component Guidelines

### Using Shared UI Components

Always use components from `src/components/ui/` for consistency:

```tsx
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

// Example usage
<Card header="Project Details">
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

Colors and other design values are CSS custom properties in `src/styles/tokens.css`. Use them in
stylesheets:

```css
.thing {
  color: var(--gw-color-primary);
}
```

For unavoidable inline styles, `src/components/ui/styles.ts` mirrors the same values:

```tsx
import { colors, typography, spacing, borderRadius, shadows } from '../components/ui/styles';

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

- `tokens.css` - Design tokens (colors, etc.); the only place new color literals belong
- `bootstrap-subset.scss` - Selective Bootstrap build (loaded in `main.tsx`)
- `app.scss` - Main app styles; imports `tokens.css`, `utilities.css`, `gw-marketing-system.css`
- `marketing-landing.css` - Landing/login pages and the app shell chrome
- `auth-panel.css`, `totp.css` - Sign-in and MFA
- `document-editor.css` - Editor-specific styles
- Page styles: `landing-page.css`/`base-page.css` (home), `dashboard.css`, `checklists.css`, `playground.css`, ...


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
import { useBranding } from '../common/branding';
import { useNotifications } from '../components/notifications/NotificationManager';

// In component
const appConfig = useContext(AppContext);   // loaded aws-exports config
const { appName } = useBranding();          // active instance branding
const { addNotification } = useNotifications();
```

### Data Persistence

Draft data is saved with `useDraftSave` (`hooks/use-draft-save.ts`): debounced (via `useAutoSave`),
revision-checked (a concurrent writer gets a 409 and is merged per section), flushed on page exit,
and mirrored to a per-session localStorage cache. Don't hand-roll localStorage + fetch saves.
Use `useAutoSave` directly for other forms that need debounced saving with a status indicator.

---

## API Integration

### API Client

API calls are centralized in `src/common/api-client/`. Components get a memoized client from the
`useApiClient` hook:

```tsx
import { useApiClient } from '../hooks/use-api-client';

const apiClient = useApiClient();

// Example: Fetch NOFO data
const result = await apiClient.landingPage.getNOFOQuestions(nofoId);

// Example: Save draft
await apiClient.drafts.updateDraft(draft);
```

### Client Modules

| Client | Purpose |
|--------|---------|
| `landingPage` | NOFOs, summaries, questions, admin review/processing |
| `drafts` | Drafts, versions, generation, DOCX/PDF export |
| `sessions` | Chat sessions |
| `userDocuments` | User-uploaded supporting documents |
| `kbSync` | Knowledge base sync |
| `userManagement` | Admin user operations |
| `userProfile` | Current user's profile |
| `notifications` | In-app notifications |
| `analytics` | Admin analytics |

---

## Contributing

### Code Style

- Use TypeScript for all new code
- Run `npm run lint` (ESLint with jsx-a11y strict) and `npm run lint:colors` before pushing
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
