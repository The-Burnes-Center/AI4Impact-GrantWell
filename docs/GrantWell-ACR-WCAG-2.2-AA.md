# GrantWell Accessibility Conformance Report

**WCAG Edition (Based on VPAT® Version 2.5 Rev)**

| | |
|---|---|
| **Name of Product/Version** | GrantWell (web application), version 3.3.5 |
| **Report Date** | November 12, 2026 |
| **Product Description** | AI-assisted grant discovery and application tool for state agencies, municipalities and community organizations: grant search and filters, requirements checklists with cited grant passages, an AI chat assistant, a five-step application writer with version history and Word/PDF export, a supporting-documents library, profile and two-step verification, and an administrative dashboard. |
| **Contact Information** | Anjith Prakash, Burnes Center for Social Change / AI for Impact, chathankandy.a@ai4impact.ai |
| **Evaluator** | Anjith Prakash (Burnes Center for Social Change / AI for Impact), with AI-assisted review and test automation by Anthropic's Claude (Claude Code) |
| **Evaluated deployment** | grantwell.us (the Generic deployment), signed out and signed in as a standard user and as an administrator |

## Notes

1. This report covers GrantWell version 3.3.5. It replaces the report for version 2.0.0 dated August 27, 2026.
2. An independent accessibility audit by Deque Systems (June 25–30, 2026; 143 issues across 17 pages and 8 components) was used as the checklist for this evaluation. Each of the 143 issues in Deque's issue export, and every remark in its VPAT, was re-checked by issue ID against version 3.3.5; all are resolved. Remarks below cite Deque issue IDs where they help. Deque has not re-audited version 3.3.5.
3. Sign-in includes Cloudflare Turnstile, a third-party security check, configured in Invisible mode: it shows no visible or focusable content and asks nothing of the user.
4. Grant summaries and chat answers display text written by the AI from grant documents. Their link text and language follow the grant documents themselves.
5. Out of scope: Word and PDF files exported by users, email sent by GrantWell, and the AWS-hosted services behind the web application.

## Evaluation Methods Used

1. **Independent audit as checklist.** Deque's June 2026 audit: its executive summary, its VPAT and its full issue export (143 issues, each with the page, the element and the WCAG criterion). Each issue was traced by ID to the code that renders it and confirmed fixed in version 3.3.5 in AI-assisted reviews that were given only the audit and the code, and in the browser wherever the issue concerns layout, zoom, focus or contrast.
2. **Source review.** Review of the full web interface at the release commit (packages/ui: React 18, TypeScript, CSS), with each finding cited to file and line, including how the CSS cascade resolves between the GrantWell styles and Bootstrap.
3. **Browser testing.** Playwright with Chromium on 23 page states, including all five application steps on an application with generated sections, at 1280×900, 1280×720, 844×390 (landscape), 640×450 and 640×360 (200% zoom), 960×540 (1920×1080 at 200%), 320×640 and 320×256. Each state was checked for horizontal scrolling and content outside the viewport, clipping under the WCAG text-spacing override, a visible focus indicator at every Tab stop, and focused elements hidden by other content. Targeted checks covered each Deque issue that needs a browser and the rich-text Section editor: toolbar keyboard use, the pinned toolbar and caret, and pasting from word processors.
4. **Automated checks.** axe-core 4.13 with the WCAG 2.0, 2.1 and 2.2 A and AA rule sets on every page state: 0 violations. The eslint jsx-a11y rules run on every change.
5. **Screen reader.** Guidepup's NVDA 2026.2 build on Windows with Microsoft Edge, driven by Guidepup with the speech captured, on November 12, 2026: sign-in, header and tabs, the side menu inside a grant, the phone menu, admin tabs and toggles, a second deployment's full footer and accordions, the rich-text Section editor (toolbar, Text style and phone Format menus, link dialog) and Select all in My applications. The evaluator reviewed the speech with AI assistance, and the fixes it prompted were confirmed in later runs. The speech capture records what follows a key press, so status messages that arrive later were verified with component and browser tests.
6. **Contrast measurement.** WCAG contrast ratios computed from the colors that actually render on grantwell.us, including hover, focus, pressed, read-only and disabled states.
7. **Component tests.** 420 automated interface tests, including accessible names, live regions, focus movement, keyboard operation of menus, tabs, dialogs, the editor toolbar and the sign-in time limit, and Markdown round-trips for the Section editor; plus 483 back-end tests, including the Word and PDF export of headings, lists and links.

## Scope of Evaluation

The pages and states in the following table were evaluated.

| Page or state | Address |
|---|---|
| Landing page | `/` |
| Sign in, Create account, Verify email, Forgot and reset password | `/login` |
| Two-step verification: code entry and first-time setup | `/login (after the password)` |
| What's new | `/whats-new` |
| Page not found | any unknown address |
| Home: grant search, filters and grants table | `/home` |
| Requirements (with cited grant passages) | `/requirements/<grant>` |
| Chat with AI | `/chat/<chat>?grant=<grant>` |
| My chats | `/chat/sessions` |
| My applications | `/document-editor/drafts` |
| New application dialog | `/document-editor?grant=<grant>` |
| Application steps: Project basics, Questionnaire, Additional information, Section editor, Review | `/document-editor/<application>?step=…` |
| Version history and Word/PDF export | Section editor and Review |
| My documents | `/documents` |
| Profile (account, two-step verification, notifications) | `/profile` |
| Admin dashboard: Grants, Needs attention, Analytics, User management | `/admin/dashboard` |
| Header, tabs, side menu, phone menu, footer, Help & feedback | every signed-in page |

## Applicable Standards/Guidelines

This report covers the degree of conformance for the following accessibility standard/guidelines:

| Standard/Guideline | Included In Report |
|---|---|
| Web Content Accessibility Guidelines 2.0 | Level A (Yes) / Level AA (Yes) / Level AAA (No) |
| Web Content Accessibility Guidelines 2.1 | Level A (Yes) / Level AA (Yes) / Level AAA (No) |
| [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) | Level A (Yes) / Level AA (Yes) / Level AAA (No) |

## Terms

The terms used in the Conformance Level information are defined as follows:

- **Supports**: The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation.
- **Partially Supports**: Some functionality of the product does not meet the criterion.
- **Does Not Support**: The majority of product functionality does not meet the criterion.
- **Not Applicable**: The criterion is not relevant to the product.
- **Not Evaluated**: The product has not been evaluated against the criterion. This can only be used in WCAG Level AAA criteria.

## WCAG 2.2 Report

Note: When reporting on conformance with the WCAG 2.2 Success Criteria, the criteria are scoped for full pages, complete processes, and accessibility-supported ways of using technology as documented in the WCAG 2.2 Conformance Requirements.

### Table 1: Success Criteria, Level A

Notes: 4.1.1 Parsing is obsolete and was removed in WCAG 2.2, so it is not listed. Under the WCAG 2.0 and 2.1 errata it is always satisfied for HTML content.

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| **1.1.1 Non-text Content (Level A)** | Supports | Images that carry information have text alternatives: the GrantWell logo, partner logos, status icons in the section list (for example "Budget: completed") and the grant-type badges. Decorative icons, including the warning triangle in confirmation dialogs and every icon inside a labelled button, are hidden from assistive technology. Charts on the Analytics tab are hidden from screen readers and followed by data tables with the same figures. Checked on all pages in scope, including the footer and Create account. |
| **1.2.1 Audio-only and Video-only (Prerecorded) (Level A)** | Not Applicable | There is no prerecorded audio-only or video-only content. |
| **1.2.2 Captions (Prerecorded) (Level A)** | Not Applicable | There is no prerecorded video with audio. |
| **1.2.3 Audio Description or Media Alternative (Prerecorded) (Level A)** | Not Applicable | There is no prerecorded video. |
| **1.3.1 Info and Relationships (Level A)** | Supports | Each page has one h1 and a heading outline in order; while the New application dialog is open, its title is the h1. Grant, chat, application, user and outcome lists are tables with column headers, or ARIA tables with row and column headers. Form fields have programmatic labels; groups of radio buttons, checkboxes and toggles are named groups; each application's outcome fields are grouped under its name. Requirement lists, the questionnaire and the application steps are lists. Side-menu group titles are group labels, not headings ahead of the page h1. The Section editor is a rich-text editor: section headings and lists are real headings (h3, h4) and lists, including older AI text written as bold lines (Deque 2745439), and the Word and PDF exports keep them. Select all checkboxes are not column headers (Deque 2743642). |
| **1.3.2 Meaningful Sequence (Level A)** | Supports | Reading and Tab order follow the visual order on every page. Static text on Additional information, including the document picker instructions, is read in sequence. |
| **1.3.3 Sensory Characteristics (Level A)** | Supports | Instructions refer to controls by their names, not by shape, color, size or position. |
| **1.4.1 Use of Color (Level A)** | Supports | Color is never the only cue. Links in text are underlined; the current tab and step have a bar or fill and an accessible state; errors have an icon and text; review recommendations are named in text. On the Analytics tab, Active bars are hatched as well as colored, and data tables follow each chart. |
| **1.4.2 Audio Control (Level A)** | Not Applicable | No audio plays automatically. |
| **2.1.1 Keyboard (Level A)** | Supports | All functionality works from the keyboard: grant selection, filters and sort, the application stepper (locked steps stay focusable and say why they are locked), the Section editor toolbar (one Tab stop, arrow keys between tools, standard Ctrl shortcuts) and its phone Format menu, version history, the export menu, the document picker, admin row menus and dialogs. Every dialog has a close button and closes with Escape. Scrolling tables and text boxes are focusable regions. |
| **2.1.2 No Keyboard Trap (Level A)** | Supports | Focus can always leave every component. Dialogs keep focus inside until closed, then return it to the control that opened them, or into the dialog beneath, or to the main content. |
| **2.1.4 Character Key Shortcuts (Level A 2.1 and 2.2)** | Not Applicable | There are no single-character keyboard shortcuts. |
| **2.2.1 Timing Adjustable (Level A)** | Supports | The only time limit is Cognito's 15-minute limit on each sign-in step after the password: the code step and Set new password. Two minutes before it ends, a warning shows a live countdown and a Keep signing in button, which restarts the step as many times as needed without re-entering the password or losing a partly typed code (first-time setup shows a new QR code, as the warning says). Screen readers hear the warning at two minutes and again at 30 seconds. There is no time limit once signed in. Messages and notifications stay until dismissed, and AI answers have no response deadline. |
| **2.2.2 Pause, Stop, Hide (Level A)** | Supports | Nothing moves, blinks or scrolls automatically. The admin processing queue, which refreshes every 10 seconds, has a Pause auto-refresh control. Loading indicators stop when loading ends. |
| **2.3.1 Three Flashes or Below Threshold (Level A)** | Supports | Nothing flashes. |
| **2.4.1 Bypass Blocks (Level A)** | Supports | Every page starts with a working Skip to main content link that moves focus to the main landmark, including Sign up and Verify email. Pages use banner, navigation, main and contentinfo landmarks. |
| **2.4.2 Page Titled (Level A)** | Supports | Every page and step has a descriptive title, for example "Create account – GrantWell", "Questionnaire – Write application – GrantWell" and "Set up two-step verification – GrantWell". |
| **2.4.3 Focus Order (Level A)** | Supports | Focus order matches the visual order. Dialogs hold focus until closed (Deque 2748796, 2743882, 2748926), return it afterwards, and never pull it away from someone already working inside them. Error summaries take focus only when Continue is pressed, not while fields are filled in (Deque 2743771). When a focused control goes away (a completed form, a dismissed card, a view switch, a finished step, Keep signing in, a background refresh), focus moves to the content that replaces it. Buttons that are busy or unavailable keep focus. Menus close when focus leaves them, and a Text style choice returns focus to the text. |
| **2.4.4 Link Purpose (In Context) (Level A)** | Supports | Link text, or the text with its context, describes each link. Links that open a new tab say so, including links in AI answers. |
| **2.5.1 Pointer Gestures (Level A 2.1 and 2.2)** | Supports | No function needs a multipoint or path-based gesture. |
| **2.5.2 Pointer Cancellation (Level A 2.1 and 2.2)** | Supports | Actions run on the up event and can be cancelled by moving the pointer off the control. |
| **2.5.3 Label in Name (Level A 2.1 and 2.2)** | Supports | Every control's accessible name contains its visible label, including while busy (for example "Refreshing chats list"), the Additional context field, review actions such as Needs re-upload (Deque 2748887), Make final edits, and the section list, whose names start with each section's number and name. |
| **2.5.4 Motion Actuation (Level A 2.1 and 2.2)** | Not Applicable | No function uses device or user motion. |
| **3.1.1 Language of Page (Level A)** | Supports | Every page sets lang="en". |
| **3.2.1 On Focus (Level A)** | Supports | Receiving focus never changes context. |
| **3.2.2 On Input (Level A)** | Supports | Entering data never changes context by itself. The six-digit code is submitted with Verify, not on the sixth digit; filters update results in place and announce the new count. |
| **3.2.6 Consistent Help (Level A 2.2 only)** | Supports | Help & feedback is in the same place in the header on every signed-in page. |
| **3.3.1 Error Identification (Level A)** | Supports | Errors name the field and describe the problem in text under it, and focus moves to the first field to fix, including the email address in Add user. If the security check fails, the message says so, offers Try the check again, and gives the support email. |
| **3.3.2 Labels or Instructions (Level A)** | Supports | Every field has a visible label, including the Home feedback field (Deque 2744302), Select all checkboxes (Deque 2748963), summary item fields in the admin review and the Analytics state filter; required fields are marked; password rules are shown with the password field; Profile setup says which fields are missing. Placeholder text is only ever an example. |
| **3.3.7 Redundant Entry (Level A 2.2 only)** | Supports | Information entered earlier in an application is kept and shown in later steps; nothing must be typed twice. |
| **4.1.2 Name, Role, Value (Level A)** | Supports | Custom controls expose name, role and state: tabs, toggles (pressed), the stepper (current step, locked), accordions (expanded), menus, the version list, table sort buttons, and the Section editor, a multi-line text box named for its section, whose toolbar toggles report pressed and whose Text style menu reports the current style. Tooltip content is available to screen readers through descriptions and, on phones, through the All steps list. Navigation items are links. |

### Table 2: Success Criteria, Level AA

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| **1.2.4 Captions (Live) (Level AA)** | Not Applicable | There is no live audio or video. |
| **1.2.5 Audio Description (Prerecorded) (Level AA)** | Not Applicable | There is no prerecorded video. |
| **1.3.4 Orientation (Level AA 2.1 and 2.2)** | Supports | Nothing is locked to an orientation. Every application step was checked at 844×390 landscape and phone portrait; the title bar and stepper stop pinning on short screens. |
| **1.3.5 Identify Input Purpose (Level AA 2.1 and 2.2)** | Supports | Fields that collect the user's own information have autocomplete values: email, current and new password, one-time code, organization, organization title and state (address-level1), on sign-up, profile setup and Profile. |
| **1.4.3 Contrast (Minimum) (Level AA)** | Supports | Text meets 4.5:1, or 3:1 when large, in every state, measured from the rendered colors: for example body text 12.6:1, secondary text 6.9:1, links 5.4:1, hover text on tinted fills 6.4:1 or more, Make final edits on hover 5.4:1, sign-in buttons 5.35:1 at rest and 7.8:1 on hover and focus, and busy or disabled button text such as Saving…, Publishing… and Creating draft… 5.04:1. Checked on Sign up, Verify email, Home, My chats, My applications, Review, the admin tabs and User management. |
| **1.4.4 Resize Text (Level AA)** | Supports | At 200% zoom (640×450, 640×360 and 960×540) nothing is lost, clipped or covered on any page in scope, including Chat with AI, whose transcript and message box stay reachable, and the application steps. |
| **1.4.5 Images of Text (Level AA)** | Supports | Text is never shown as an image, apart from logos. |
| **1.4.10 Reflow (Level AA 2.1 and 2.2)** | Supports | At 320 CSS pixels every page reflows to one column without horizontal scrolling, except data tables, which scroll inside labelled regions. The header becomes a menu, toggles, dialog buttons and bulk actions wrap, the application stepper adds an All steps list with each step's state and help text, and the Section editor toolbar becomes a Format menu. |
| **1.4.11 Non-text Contrast (Level AA 2.1 and 2.2)** | Supports | Field borders are 4.54:1, focus rings 5.35:1 (2px, with a 2px gap), and selected, pressed and current states at least 3:1, including radio buttons and checkboxes on Home, Sign up and Verify email, and the chart bars and focus rings on the Analytics tab. |
| **1.4.12 Text Spacing (Level AA 2.1 and 2.2)** | Supports | With line height 1.5, letter spacing 0.12em, word spacing 0.16em and paragraph spacing 2em, no text is cut off and all text follows the new spacing, at 1280 and 320 pixels on every page in scope. |
| **1.4.13 Content on Hover or Focus (Level AA 2.1 and 2.2)** | Supports | Tooltips open on hover and focus, stay while hovered, and close with Escape from anywhere; menus stay open until dismissed. On phones the step tooltips' text is also in the All steps list. |
| **2.4.5 Multiple Ways (Level AA)** | Supports | Pages are reached from the header tabs, the side menu, breadcrumbs and grant search. |
| **2.4.6 Headings and Labels (Level AA)** | Supports | Headings and labels describe their topic or purpose, for example "Filter by status", "State guidance note" and "Search outcomes", and "Requested amount (USD)" (Deque 2743818). Repeated buttons carry the item they act on, for example "Copy reply 1 to clipboard", "Add item to Required documents" and each application's name with its date. |
| **2.4.7 Focus Visible (Level AA)** | Supports | Every focusable element shows a 2px focus ring with a 2px gap, including sign-in fields, Bootstrap form controls, toggles, tabs, pagination, file pickers (on the button they cover), footer links on dark backgrounds, Chat with AI, the Section editor and its toolbar, menu items, and the Needs attention view, including Source document preview (Deque 2748844). |
| **2.4.11 Focus Not Obscured (Minimum) (Level AA 2.2 only)** | Supports | Focused elements are never entirely hidden. The application title bar and stepper reserve scroll padding; on phones the open All steps list unpins them so it never covers the field in focus, and on tall screens the editor toolbar stays below the stepper with the caret kept clear of it. Checked by tabbing through every step at 1280×900, 1280×720, 960×540, 844×390 and 320×568, and the New application dialog at 200%. |
| **2.5.7 Dragging Movements (Level AA 2.2 only)** | Supports | Document upload accepts drag and drop and also a Browse button; nothing needs dragging. |
| **2.5.8 Target Size (Minimum) (Level AA 2.2 only)** | Supports | Targets are at least 24×24 CSS pixels, or are links within text, including the TOTP Copy button, alert and banner close buttons and Create an account. |
| **3.1.2 Language of Parts (Level AA)** | Supports | Content is in English; there are no passages in another language. |
| **3.2.3 Consistent Navigation (Level AA)** | Supports | The header, tabs and side menu are in the same order on every page. |
| **3.2.4 Consistent Identification (Level AA)** | Supports | Controls with the same function have the same name everywhere, for example Help & feedback, Delete and Version history. |
| **3.3.3 Error Suggestion (Level AA)** | Supports | Error messages say how to fix the input, for example "Enter the 6-digit code from your authenticator app." |
| **3.3.4 Error Prevention (Legal, Financial, Data) (Level AA)** | Supports | There are no legal or financial transactions. Deleting chats, applications, documents, users or an account asks for confirmation first, and application text can be restored from version history. |
| **3.3.8 Accessible Authentication (Minimum) (Level AA 2.2 only)** | Supports | Sign-in accepts pasted and password-manager passwords (current-password, new-password) and pasted or autofilled one-time codes (one-time-code). The security check asks nothing of the user. |
| **4.1.3 Status Messages (Level AA 2.1 and 2.2)** | Supports | Status messages are announced without moving focus, once each: search, filter and page results, saved and deleted notices, busy states such as Refreshing, Saving, Adding, Publishing and Reprocessing, selection counts, sign-in busy and time-limit messages, upload and export progress, generation progress, the grant picker, the processing banner and version history. Each comes from a region that is in the page before its message. |

### Table 3: Success Criteria, Level AAA

Notes: Not Evaluated. GrantWell was not evaluated for WCAG 2.2 Level AAA conformance.

## Legal Disclaimer

This report describes the accessibility of GrantWell version 3.3.5 as evaluated on the date above. It is provided for information and is not a warranty. Later versions, content added by users or administrators, and configuration by other deployments can change conformance. The Burnes Center for Social Change welcomes reports of accessibility barriers through Help & feedback in GrantWell or by email to hello@grantwell.us.
