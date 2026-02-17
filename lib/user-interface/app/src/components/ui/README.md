# UI Components Library

A collection of reusable, accessible React components for the GrantWell application.

## Overview

This library provides standardized UI components that ensure consistency across the application while following accessibility best practices (WCAG 2.1 compliant).

## Installation

Components are already part of the project. Import them directly from their files:

```tsx
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { colors, spacing } from '../components/ui/styles';
```

## Components

### Button

A versatile button component with multiple variants and sizes.

```tsx
import Button from '../components/ui/Button';

// Primary button (default)
<Button onClick={handleSubmit}>Submit</Button>

// Secondary button
<Button variant="secondary" onClick={handleCancel}>Cancel</Button>

// Danger button
<Button variant="danger" onClick={handleDelete}>Delete</Button>

// Small size with loading state
<Button size="sm" loading={isLoading}>Save</Button>

// Full width button
<Button fullWidth>Sign In</Button>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'ghost'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `fullWidth` | `boolean` | `false` | Take full container width |
| `loading` | `boolean` | `false` | Show loading state |
| `disabled` | `boolean` | `false` | Disable button |

---

### Card

A container component with optional header.

```tsx
import Card from '../components/ui/Card';

// Simple card
<Card>
  <p>Card content here</p>
</Card>

// Card with header
<Card header="Settings">
  <SettingsForm />
</Card>

// Card with header actions
<Card 
  header="Users" 
  headerActions={<Button size="sm">Add User</Button>}
>
  <UserList />
</Card>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `header` | `string` | - | Header title |
| `headerActions` | `ReactNode` | - | Actions in header |
| `headerStyle` | `'primary' \| 'default' \| 'none'` | `'primary'` | Header appearance |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Content padding |

---

### LoadingSpinner

An accessible loading indicator.

```tsx
import LoadingSpinner from '../components/ui/LoadingSpinner';

// Default spinner
<LoadingSpinner />

// With message
<LoadingSpinner message="Loading data..." showMessage />

// Small inline spinner
<LoadingSpinner size="sm" centered={false} />

// Custom color
<LoadingSpinner color="#28a745" />
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Spinner size |
| `color` | `string` | Primary color | Spinner color |
| `message` | `string` | `'Loading...'` | Screen reader text |
| `showMessage` | `boolean` | `false` | Show message visually |
| `centered` | `boolean` | `true` | Center in container |

---

### FormField

A form input wrapper with label, help text, and error handling.

```tsx
import FormField from '../components/ui/FormField';

// Basic input
<FormField
  label="Email"
  name="email"
  type="email"
  value={email}
  onChange={handleChange}
  required
/>

// With error state
<FormField
  label="Password"
  name="password"
  type="password"
  value={password}
  onChange={handleChange}
  error="Password must be at least 8 characters"
  helpText="Use a mix of letters, numbers, and symbols"
/>

// Textarea
<FormField
  label="Description"
  name="description"
  as="textarea"
  rows={4}
  value={description}
  onChange={handleChange}
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | Required | Field label |
| `name` | `string` | Required | Field name/id |
| `type` | `string` | `'text'` | Input type |
| `as` | `'input' \| 'textarea'` | `'input'` | Element type |
| `error` | `string` | - | Error message |
| `helpText` | `string` | - | Help text |
| `required` | `boolean` | `false` | Required field |
| `rows` | `number` | `3` | Textarea rows |

---

### FormErrorSummary

Displays a summary of form validation errors.

```tsx
import FormErrorSummary from '../components/ui/FormErrorSummary';

<FormErrorSummary
  errors={{
    name: "Name is required",
    email: "Invalid email format"
  }}
  fieldLabels={{
    name: "Full Name",
    email: "Email Address"
  }}
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `errors` | `Record<string, string \| undefined>` | Required | Error messages by field |
| `fieldLabels` | `Record<string, string>` | `{}` | Display labels for fields |
| `title` | `string` | Auto-generated | Summary title |
| `autoFocus` | `boolean` | `true` | Focus summary on render |

---

### AutoSaveIndicator

Shows auto-save status (saving/saved).

```tsx
import AutoSaveIndicator from '../components/ui/AutoSaveIndicator';

const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

<AutoSaveIndicator status={saveStatus} />

// Custom labels
<AutoSaveIndicator 
  status={saveStatus}
  savingText="Syncing..."
  savedText="Synced"
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `'idle' \| 'saving' \| 'saved' \| 'error'` | Required | Current status |
| `savingText` | `string` | `'Saving...'` | Saving message |
| `savedText` | `string` | `'Saved'` | Saved message |
| `errorText` | `string` | `'Error saving'` | Error message |

---

### NavigationButtons

Back/Continue button pair for multi-step forms.

```tsx
import NavigationButtons from '../components/ui/NavigationButtons';

// Basic usage
<NavigationButtons
  onBack={() => goToStep(currentStep - 1)}
  onContinue={() => goToStep(currentStep + 1)}
/>

// First step (no back button)
<NavigationButtons
  showBack={false}
  onContinue={handleNext}
/>

// Custom labels
<NavigationButtons
  onBack={handleBack}
  onContinue={handleSubmit}
  backLabel="Previous"
  continueLabel="Submit"
/>

// Loading state
<NavigationButtons
  onContinue={handleSubmit}
  continueLoading={isSubmitting}
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onBack` | `() => void` | - | Back button handler |
| `onContinue` | `() => void` | - | Continue button handler |
| `backLabel` | `string` | `'Back'` | Back button text |
| `continueLabel` | `string` | `'Continue'` | Continue button text |
| `showBack` | `boolean` | `true` | Show back button |
| `showContinue` | `boolean` | `true` | Show continue button |
| `continueDisabled` | `boolean` | `false` | Disable continue |
| `continueLoading` | `boolean` | `false` | Loading state |

---

## Style Constants

Import design tokens for consistent styling:

```tsx
import { colors, typography, spacing, borderRadius, shadows } from '../components/ui/styles';

// Use in styles
const myStyle = {
  color: colors.primary,           // #14558F
  fontFamily: typography.fontFamily, // 'Noto Sans', sans-serif
  padding: spacing.lg,             // 16px
  borderRadius: borderRadius.md,   // 6px
  boxShadow: shadows.md,           // 0 1px 3px rgba(0, 0, 0, 0.1)
};
```

### Available Tokens

**Colors:**
- `colors.primary` - Brand blue (#14558F)
- `colors.primaryHover` - Darker blue (#104472)
- `colors.error` - Error red (#d32f2f)
- `colors.success` - Success green (#28a745)
- `colors.text` - Primary text (#1a202c)
- `colors.textSecondary` - Secondary text (#5a6575)
- `colors.border` - Border color (#e2e8f0)
- `colors.white` - White (#ffffff)
- `colors.background` - Background (#f8f9fa)

**Typography:**
- `typography.fontFamily` - 'Noto Sans', sans-serif
- `typography.fontSize.sm` - 14px
- `typography.fontSize.base` - 16px
- `typography.fontSize.lg` - 18px
- `typography.fontWeight.medium` - 500
- `typography.fontWeight.semibold` - 600

**Spacing:**
- `spacing.xs` - 4px
- `spacing.sm` - 8px
- `spacing.md` - 12px
- `spacing.lg` - 16px
- `spacing.xl` - 20px
- `spacing['2xl']` - 24px

**Border Radius:**
- `borderRadius.sm` - 4px
- `borderRadius.md` - 6px
- `borderRadius.lg` - 8px
- `borderRadius.xl` - 12px

---

## Accessibility

All components follow WCAG 2.1 guidelines:

- Proper ARIA attributes
- Keyboard navigation support
- Focus management
- Screen reader announcements
- Color contrast compliance
- Error messaging with `role="alert"`

---

## Contributing

When adding new components:

1. Place in `src/components/ui/`
2. Add JSDoc comments with examples
3. Import directly from the file (no barrel/index files)
4. Update this README
5. Follow existing patterns for consistency
