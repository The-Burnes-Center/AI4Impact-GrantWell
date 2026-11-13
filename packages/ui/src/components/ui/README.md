# UI kit

GrantWell's shared look has two layers:

1. **CSS classes** (`gw-*`) in `src/styles/components.css`. Shapes follow the Colorado Design System;
   colours come from each deployment's tokens (`src/styles/tokens.css`, overridden by an instance's
   `chrome/theme.css`). Page CSS adds layout (margins, widths), never looks.
2. **React components** in this folder, for the few patterns that need behaviour as well as styling.

Prefer a class or component over inline styles, and tokens (`var(--gw-color-*)`) over hex values.
`npm run lint:colors` fails on new hardcoded colours.

## Classes

| Pattern | Classes | Notes |
|---|---|---|
| Buttons | `gw-btn` + `gw-btn--primary`, `--secondary`, `--danger`, `--inverse` and `--inverse-outline` (on dark fills); `--slim`, `--icon` | One primary per action area. Back/Cancel are secondary on the left, the main action on the right. |
| Fields | `gw-field` wrapping `gw-field__label`, `gw-field__required` (the `*`, `aria-hidden`), `gw-input`, `gw-field__help`, `gw-field__message` (error) or `gw-field__message--success` | Point the input's `aria-describedby` at the help and message ids, and set `aria-invalid` when it has an error. `gw-input--error` / `--success` colour the border. |
| Alerts | `gw-alert` + `gw-alert--info`, `--success`, `--warning`, `--urgent`, `--brand` (brand tint, for neutral news such as result counts); `gw-alert__title` | A leading `<svg>` takes the bar colour. Wrap the title and text in one `<div>`, since the alert is a flex row. Add `role="alert"` / `role="status"` yourself where the message is announced. react-bootstrap `<Alert>` gets the same look. |
| Toasts | `gw-toast` + `gw-toast--info`, `--success`, `--warning`, `--urgent` | Used by the notification bar. |
| Tags | `gw-tag` + `gw-tag--neutral`, `--info`, `--success`, `--warning`, `--danger` | Status pills and badges. |
| Tabs | `gw-tabs` (the `tablist`), `gw-tab` | Roving `tabIndex` and arrow keys are the page's job. |
| Modal | `gw-modal__overlay`, `gw-modal`, `gw-modal__header`, `gw-modal__title`, `gw-modal__body`; footer actions in `.modal-actions` as the body's last child, or `<Modal footer>` to pin them below a scrolling body | Use `<Modal>` (`components/common/Modal.tsx`) rather than the classes: it brings the focus trap, Escape, scroll lock, focus return and labelling. |
| Pagination | `gw-pagination` and its `__*` parts | Use `<PaginationControls>`. |
| Toggle | `gw-toggle`, `gw-toggle__option` | Joined buttons for one choice among a few (`aria-pressed` or `role="radio"`). |
| Select all | `gw-select-all` | Select-all checkbox and label above a table. |

Every kit control draws the same focus ring: `var(--gw-focus-width) solid var(--gw-color-focus)` at
`var(--gw-focus-offset)`. `app.scss` gives every other focusable element that ring too.

## Components

Import each from its file; there is no barrel file.

### Button

A thin wrapper over `gw-btn`. `variant`: `primary` (default), `secondary`, `danger`, `ghost` (renders
as secondary); `size="sm"` adds `gw-btn--slim`; `fullWidth`; `loading` shows dots and ignores clicks
but stays focusable (`aria-disabled`).

```tsx
<Button onClick={save}>Save</Button>
<Button variant="secondary" onClick={cancel}>Cancel</Button>
```

### Card

The Write application step container. `header` (an h2), `headerActions`, `headerStyle`
(`primary` filled bar, the default; `default` plain; `none`), `padding` (`none` | `sm` | `md` | `lg`).

### NavigationButtons

Back and Continue for the Write application steps. Name the step in `backLabel`
("Back to project basics"). Also `continueLabel`, `showBack`, `showContinue`, `continueDisabled`,
`continueLoading` (announced in a status region) and `justify`.

### AutoSaveIndicator

Save status for a step: `status` is `idle` | `pending` | `saving` | `saved` | `error`. `idleText` keeps
a line on screen while idle; `onRetry` adds a Retry button on error; `variant="onPrimary"` for the
filled Card header. It announces one "Saved" per save and one alert per failure; pass
`announce={false}` on a second, visual-only copy.

### FormErrorSummary

The error list at the top of a form. `errors` and `fieldLabels` by field name; bump `focusRequest` on
each failed submit to move focus to it (it is announced by focus, not a live region). Each error links
to its field.

### LoadingSpinner

`size` (`sm` | `md` | `lg`), `message`, `showMessage`, `centered`. The message goes into a status
region once it exists, so it is announced.

### TableScrollRegion

A focusable, labelled scroll container for wide tables (`label`, optional `minWidth`).

### IconButton

A borderless 44px icon button. `label` is its accessible name and its tooltip, shown on hover and
keyboard focus and dismissed with Escape; `tipAlign` (`center`, `start`, `end`) keeps the tooltip
inside a box edge. Other button props pass through.

## styles.ts

JS constants for the inline styles that remain (the Write application steps). Colours and shadows
resolve to the same tokens (`colors.primary` is `var(--gw-color-primary)`, `colors.error` is
`var(--gw-color-danger-text)`, `colors.textInverse` is for text on a primary fill), so they follow each
deployment's theme. Spacing, font sizes and radii are fixed pixel values. New code should use classes
and tokens instead.

## Accessibility

WCAG 2.2 AA: 4.5:1 text and 3:1 non-text contrast, a visible focus ring, targets of at least 24px (kit
buttons are 40px), and never colour alone; pair a status colour with an icon or text.
