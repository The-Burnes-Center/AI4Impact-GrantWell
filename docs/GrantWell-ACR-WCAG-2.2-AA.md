# GrantWell Accessibility Conformance Report

**WCAG Edition — Based on VPAT® Version 2.5**

| | |
|---|---|
| **Name of Product/Version** | GrantWell (web application), v2.0.0 |
| **Product Description** | AI-assisted grant discovery and application-drafting tool for municipalities: grant (NOFO) browsing and search, requirements checklists, an AI chat assistant, a guided document editor, and an administrative dashboard. |
| **Report Date** | August 27, 2026 |
| **Contact Information** | Anjith Prakash, Burnes Center for Social Change / AI for Impact — chathankandy.a@ai4impact.ai |
| **Applicable Standards/Guidelines** | [WCAG 2.2](https://www.w3.org/TR/WCAG22/), Level A (Table 1) and Level AA (Table 2) |
| **Evaluator** | Anjith Prakash (Burnes Center for Social Change / AI for Impact), with AI-assisted auditing and test automation performed by Anthropic's Claude (Claude Code) |

## Evaluation Methods

1. **Source-code audit** of the full frontend SPA (`lib/user-interface/app/src` — React 18 + Vite, 133 source files, 19 stylesheets), covering document structure and semantics, forms and input assistance, keyboard operability and focus, non-text content and visual presentation, and dynamic content, status messages and rich-widget ARIA. Every finding is cited to file and line.
2. **Contrast measurement** computing the WCAG relative-luminance ratio for every `color:` declaration in every stylesheet and every inline colour in TSX/TS, each evaluated against its *actual resolved background* rather than an assumed white, and against the correct threshold for its content type (4.5:1 text, 3:1 large text and meaningful non-text), with the inactive-component and decorative-content exemptions applied.
3. **Real-browser measurement** (Playwright + Chromium) of computed styles under genuine keyboard navigation, used to settle CSS-cascade questions that static reading cannot — focus-indicator visibility and colour, resolved backgrounds, and layout at 1280/900/600/400px.
4. **Automated rule checks**: `axe-core` (WCAG 2.0/2.1/2.2 A + AA rulesets) against the built application, and `eslint-plugin-jsx-a11y` at `strict` preset with structural rules escalated to error severity across the whole source tree.
5. **Component-level accessibility tests** exercising computed accessible names, ARIA table structure, live-region behaviour and keyboard activation paths on the components implicated by prior findings.
6. **Screen-reader pass** (July 10, 2026): NVDA on Windows 11 with Microsoft Edge, automated via Guidepup with captured speech output, covering all nine user-reachable pages plus deep states — the maintenance page, the session delete-confirmation modal, document-editor wizard steps, the section-editor stepper, and the dashboard Grants tab. Conducted against the build current on that date.

## Notes

1. **Scope**: the deployed web frontend — both the unauthenticated marketing, landing and login pages and the authenticated application (home, requirements checklist, chat, document editor, sessions, admin dashboard). Out of scope: PDF/DOCX exports generated via jsPDF/docx, email content sent by Cognito, and AWS-hosted backend services.
2. **Content-dependent caveat**: NOFO summaries and AI chat responses render author- and AI-supplied markdown. Conformance of that dynamic content — link-text quality, language of parts — depends on the content itself.
3. **Runtime theming**: `BrandingProvider` overwrites six `--gw-color-*` custom properties per deployment instance, so a rebrand can in principle move any brand-colour ratio in this report. The palette is therefore validated rather than assumed: `findBrandingContrastFailures` checks every brand pair the UI paints — brand text on the brand tint, primary text and links, headings, accent text, labels on filled buttons, focus rings on both light and tinted surfaces, and accent borders — against 4.5:1 for text and 3:1 for non-text, and warns during development when a palette fails. Both shipping palettes pass all eight checks. Instances supplying their own colours should call this function in their build.
4. WCAG 2.2 removed Success Criterion 4.1.1 Parsing; it is intentionally absent from Table 1.

## Terms

- **Supports**: The functionality of the product has at least one method that meets the criterion without known defects, or meets with equivalent facilitation.
- **Partially Supports**: Some functionality of the product does not meet the criterion.
- **Does Not Support**: The majority of product functionality does not meet the criterion.
- **Not Applicable**: The criterion is not relevant to the product.

---

## Table 1: Success Criteria, Level A

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| **1.1.1 Non-text Content** | Supports | Every `<img>` carries `alt`; decorative images use `alt=""` and inline SVGs are `aria-hidden="true"`. No icon-only button lacks an accessible name — icon buttons consistently pair an `aria-hidden` icon with an `aria-label`. Spinners expose `role="status"` with a label. |
| **1.2.1 Audio-only and Video-only (Prerecorded)** | Not Applicable | No audio or video content exists. Microphone input for chat produces no audio output. |
| **1.2.2 Captions (Prerecorded)** | Not Applicable | No prerecorded media. |
| **1.2.3 Audio Description or Media Alternative (Prerecorded)** | Not Applicable | No prerecorded media. |
| **1.3.1 Info and Relationships** | Supports | Relationships are programmatic throughout: real `<table>` with `<th scope="col">`, complete ARIA table roles with `aria-sort` on div-based tables, `fieldset`/`legend` on radio groups, `label htmlFor` on every control. Loading and empty states are rendered outside `role="table"` containers so the required owned-element structure holds in every state. A shared `Breadcrumbs` component renders `<nav>`/`<ol>`/`<li>` with `aria-current="page"`. Sidebar section titles are real headings. |
| **1.3.2 Meaningful Sequence** | Supports | DOM order matches visual order; the only `row-reverse`/`order` uses are cosmetic and preserve reading order. |
| **1.3.3 Sensory Characteristics** | Supports | Positional wording is always paired with the control's name; the home page carries a visually-hidden orientation note for screen-reader users. |
| **1.4.1 Use of Color** | Supports | Diff views pair colour with "+/−" glyphs, hidden "Added:/Removed:" text and strikethrough; statuses pair a shape-distinct icon with a visible text label and repeat the state in the accessible name; required fields use an asterisk plus `aria-required`. |
| **1.4.2 Audio Control** | Not Applicable | No auto-playing audio. |
| **2.1.1 Keyboard** | Supports | Navigation, menus (arrow keys, Home/End, Escape), tabs (roving tabindex), tables, modals and both upload dropzones are keyboard operable. Grant selection is a real `<button>` in each row's name cell, reached by Tab and activated by Enter or Space via the same handler as pointer input. |
| **2.1.2 No Keyboard Trap** | Supports | The shared focus trap wraps Tab but always releases on Escape and restores focus to the invoker; nested dialogs maintain a trap stack. Textareas are native and Tab exits normally. |
| **2.1.4 Character Key Shortcuts** | Not Applicable | No single-character shortcuts; all key handling uses Enter, Escape, Tab, arrows, Home, End and Space. |
| **2.2.1 Timing Adjustable** | Supports | No session or idle timeout exists in the SPA. Voice input has no app-imposed limit — recording ends when the user stops it. The chat response deadline warns at 40 seconds and offers an unlimited-use "Keep waiting" control with 20 seconds to respond, announced assertively. Toasts either never auto-dismiss or pause on hover and focus with a manual dismiss. |
| **2.2.2 Pause, Stop, Hide** | Supports | Chat streaming has a labelled Stop control. Rotating search-example tips have a persistent, keyboard-reachable "Pause examples" toggle (`aria-pressed`) whose state survives pointer and focus leaving the widget. The dashboard's 10-second auto-refresh has a "Pause auto-refresh" toggle rendered whenever the poll can run. A global `prefers-reduced-motion` rule disables animation. |
| **2.3.1 Three Flashes or Below Threshold** | Supports | No flashing or blinking content; the only infinite animations are loading spinners. |
| **2.4.1 Bypass Blocks** | Supports | "Skip to main content" links in both the public and authenticated navbars, hidden until focused, targeting `main#main-content` with `tabIndex={-1}`. Landmarks are labelled throughout. |
| **2.4.2 Page Titled** | Supports | Static descriptive title in `index.html`; per-route `document.title` for all authenticated routes, including dynamic ones. |
| **2.4.3 Focus Order** | Supports | Modals save and restore invoker focus and focus the first control on open; SPA route changes move focus to `<main>`; menus focus their first item on open and return focus to the trigger on every close path — item activation, Escape and outside-click. |
| **2.4.4 Link Purpose (In Context)** | Supports | No "click here"-style links. Links use content titles or contextual `aria-label`s, and external links announce "(opens in new tab)". |
| **2.5.1 Pointer Gestures** | Not Applicable | No multipoint or path-based gestures. Drag-and-drop upload zones have click and keyboard alternatives (see 2.5.7). |
| **2.5.2 Pointer Cancellation** | Supports | All activation uses standard `onClick` (up event); no down-event activation. Outside-`mousedown` is used only to dismiss menus, which is a permitted abort. |
| **2.5.3 Label in Name** | Supports | Accessible names contain their visible text, with the visible string first. Where a control's visible label is state-dependent, the accessible name is derived from the same expression that renders the text so the two cannot drift. Icon-only controls carry clean `aria-label`s and are outside the criterion's scope. |
| **2.5.4 Motion Actuation** | Not Applicable | No device-motion or user-motion input. |
| **3.1.1 Language of Page** | Supports | `<html lang="en">`. |
| **3.2.1 On Focus** | Supports | Focus handlers only apply styling or pause a timer; none trigger a context change. |
| **3.2.2 On Input** | Supports | No select auto-navigates; filters and page-size controls update in place. Debounced AI search updates results in place with a status region rather than changing context; Enter triggers a search explicitly. |
| **3.2.6 Consistent Help** | Supports | Where help is offered — chat playground and requirements checklist — it is a Help button in the same header position opening a labelled dialog. Informative note: no app-wide help mechanism exists on Home, Dashboard or Editor, which the criterion permits since it requires consistency only where help is provided. |
| **3.3.1 Error Identification** | Supports | Errors are identified in text and announced: a form error summary receives focus and links to each failing field; per-field errors pair `aria-invalid` with `aria-describedby` and `role="alert"`. |
| **3.3.2 Labels or Instructions** | Supports | No placeholder-only fields; every input, select and textarea has a programmatic label. Instructions are provided where needed — a live password-requirements checklist linked by `aria-describedby`, upload format and size limits, and a required-field legend. |
| **3.3.7 Redundant Entry** | Supports | The auth flow carries the email across sign-in, forgot-password, reset and verify steps without re-asking. The document-editor wizard repopulates previously entered data from the backend draft or local storage on every revisit. |
| **4.1.2 Name, Role, Value** | Supports | Correct WAI-ARIA tabs, menus with `aria-haspopup`/`aria-expanded`, dialogs with `role="dialog"`, `aria-modal` and `aria-labelledby` resolving to a rendered heading, plus `aria-sort`, `aria-current`, `aria-busy` and `aria-pressed` where applicable. Concurrently-mountable ids are generated with `useId()`. Backgrounds behind dialogs are made genuinely `inert`, not merely `aria-hidden`, so no focusable control is left inside a hidden subtree. Sidebar items expose their generation status in the accessible name, derived from the same predicate that selects the visible icon. |

---

## Table 2: Success Criteria, Level AA

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| **1.2.4 Captions (Live)** | Not Applicable | No live media. |
| **1.2.5 Audio Description (Prerecorded)** | Not Applicable | No prerecorded media. |
| **1.3.4 Orientation** | Supports | Responsive layouts throughout; no orientation locks or orientation-dependent functionality. |
| **1.3.5 Identify Input Purpose** | Supports | Correct `autocomplete` tokens throughout: `email`, `current-password`/`new-password`, `one-time-code` with `inputMode="numeric"` in auth; `organization`, `address-level2`, `postal-code`, `name` and `email` in the project-basics form. |
| **1.4.3 Contrast (Minimum)** | Partially Supports | Every text colour has been measured against its actual resolved background — including the `#F8F6F1` landing canvas and the `#DFECE0` row-hover tint, not an assumed white — and all identified failures are fixed: body text 12.63:1, secondary text 6.90:1, quality scores 5.02–5.74:1, status pills ≥5.58:1, placeholders ≥4.59:1 on every fill they occupy, and brand-primary text on the brand tint raised to `#195C53` at 6.38:1. **Rated Partially Supports** because two rounds of progressively deeper sweeps each surfaced failures the previous round missed, so residual risk remains in states not exercised here; and because the Analytics amber series renders at 1.63:1 against white, mitigated by direct value labels and a visually-hidden data table rather than by contrast. |
| **1.4.4 Resize Text** | Supports | Full-page zoom to 200% works — flex and percentage layouts with breakpoints, no fixed-height text containers that clip. Font sizes are largely px-based, so browser zoom rather than text-only scaling is the supported mechanism. |
| **1.4.5 Images of Text** | Supports | The only text-as-image instances are logotypes, which are exempt. |
| **1.4.10 Reflow** | Supports | Media queries down to 320px in nearly every stylesheet; no min-width on page containers; wide data tables use permitted `overflow-x: auto`. Verified at 1280/900/600/400px in a real browser. |
| **1.4.11 Non-text Contrast** | Supports | Focus indicators are a global 2px `#23776C` outline at 5.35:1 with a `#DFECE0` variant on dark surfaces, applied to buttons, links, form controls and ARIA roles alike, with no unreplaced `outline: none` remaining on any keyboard-reachable control. Field borders that are a control's sole boundary are `#767676` at 4.54:1. Meaningful icons and progress indicators meet 3:1, including the stepper's completed-versus-remaining connector. |
| **1.4.12 Text Spacing** | Supports | No fixed-height or `overflow: hidden` multi-line text containers; `white-space: nowrap` is confined to visually-hidden utilities, single-line cells and buttons. |
| **1.4.13 Content on Hover or Focus** | Supports | The stepper tooltip is hoverable, persistent, and dismissible with Escape from keyboard focus as well as hover. The click-toggled feedback popover has a labelled close button and restores focus. Native `title` tooltips are user-agent controlled and exempt. |
| **2.4.5 Multiple Ways** | Supports | Six routes to content: persistent top navigation, sidebar navigation, home search including AI search, a filterable and sortable grants table, a Recently Viewed panel, and breadcrumbs on interior pages. |
| **2.4.6 Headings and Labels** | Supports | One descriptive `<h1>` per view with logical h2/h3 flow; labels are descriptive throughout. Minor: markdown headings in chat replies are demoted, which can skip levels. |
| **2.4.7 Focus Visible** | Supports | Every keyboard-reachable control shows a visible indicator. No inline `outline: "none"` remains anywhere in the source tree, so no stylesheet rule can be silently overridden by an inline style. The remaining CSS `outline: none` declarations apply only to programmatic focus targets — modal containers, headings and skip-link destinations — which are not tab stops. |
| **2.4.11 Focus Not Obscured (Minimum)** | Supports | Sticky elements — table headers, side navigation, the edge feedback tab — cannot fully hide a focused element; no fixed full-width overlays sit over scrolling content. |
| **2.5.7 Dragging Movements** | Supports | Both drag-and-drop upload zones offer single-pointer and keyboard alternatives; no other draggable interactions exist. |
| **2.5.8 Target Size (Minimum)** | Supports | Interactive targets meet 24×24 CSS pixels or qualify under the spacing exception: table checkboxes sit in 44px-tall cells, modal close buttons are 44px, and sort headers carry 12×16px padding. |
| **3.1.2 Language of Parts** | Not Applicable | All UI text is English; no passages in other languages ship. |
| **3.2.3 Consistent Navigation** | Supports | Global chrome — header, navbar, footer — renders once for every authenticated route in the same order; the sidebar is a single shared component with fixed item order on all tool pages. |
| **3.2.4 Consistent Identification** | Supports | Consistent icon-and-label pairs (trash for delete, download, X for close), skip links, pagination and modal-close labelling across pages. |
| **3.3.3 Error Suggestion** | Supports | Specific corrective messages throughout: field-level format and range suggestions, Cognito errors mapped to actionable text, and per-file upload rejection reasons stating the limit. |
| **3.3.4 Error Prevention (Legal, Financial, Data)** | Supports | Every destructive action is confirmed by a shared modal naming the items with a "cannot be undone" warning; user deletion names the account; NOFO rejection requires typed justification plus a second confirmation echoing the reason. Wizard data is auto-saved and reviewable before submission. |
| **3.3.8 Accessible Authentication (Minimum)** | Supports | No CAPTCHA or cognitive test in any auth flow; paste is never blocked; password managers and OS code autofill are supported via `current-password`, `new-password` and `one-time-code` tokens; every password field has a show-password toggle. |
| **4.1.3 Status Messages** | Partially Supports | Live regions are mounted before their content and populated on change, so announcements are not lost to same-moment insertion. Errors and time-sensitive messages announce assertively, informational ones politely, and interactive controls sit outside live regions so their labels are not read as part of the message. Chat announces the start and completion of a reply rather than re-reading it on every streamed chunk. Toasts route to persistent assertive and polite containers. Document export announces start, success and failure. **Rated Partially Supports** because a small number of surfaces still create their region together with its text, and because per-section status transitions in the document editor are conveyed visually and in each control's accessible name but are not announced as they occur. |

---

## Summary of Results

| Conformance Level | Level A (31 criteria) | Level AA (24 criteria) |
|---|---|---|
| Supports | 24 | 19 |
| Partially Supports | 0 | 2 |
| Does Not Support | 0 | 0 |
| Not Applicable | 7 | 3 |

## Known Issues

1. **Analytics chart series** (1.4.3) — the amber series renders at 1.63:1 against white. Every chart carries direct value labels and a visually-hidden data table, so the information is available without relying on the graphic, but the colour itself does not meet the text threshold.
2. **Per-section generation status** (4.1.3) — while the document editor generates sections, each section's pending, generating and completed state is exposed in its control's accessible name and by a distinct icon, and overall progress is announced, but individual transitions are not announced as they occur. This is a deliberate trade-off against announcement flooding.
3. **Breadcrumb implementations** (1.3.1, maintainability) — a shared `Breadcrumbs` component exists and three pages use it; the remaining implementations are semantically equivalent but duplicated, and can drift.
4. **Markdown heading levels in chat** (2.4.6) — headings inside AI replies are demoted to fit the page outline, which can skip a level depending on the content generated.

---

*"Voluntary Product Accessibility Template" and "VPAT" are registered service marks of the Information Technology Industry Council (ITI). This report uses the VPAT WCAG edition structure; verify current template language at https://www.itic.org/policy/accessibility/vpat before external publication.*
