# GrantWell v3.0.0

**Last Updated:** October 6, 2026

This release makes it easier to write and keep track of your applications. You can now pick a grant from a list when you start a new chat or application, look back through earlier versions of an application and restore them, and protect your account with two-step verification. Grant search returns better matches, chats and AI-written applications use a newer AI model, and Word and PDF exports keep their formatting. We have also made the wording and navigation consistent across GrantWell and made the landing page load faster.

## Highlights

- **Version history for applications**: save named versions, compare them, restore earlier text, and undo an AI rewrite
- **Two-step verification**: you can now add a code from an authenticator app to protect your account
- **Better grant search and a newer AI model** for chats and AI-written applications
- **More reliable AI-written applications** and cleaner Word and PDF exports
- **Clearer navigation and wording** across GrantWell, plus a faster landing page

## New in this release

### Application Version History

- GrantWell now keeps earlier versions of your application as you work
- **Save a version** at any time and give it an optional label (for example, "Before budget rewrite"); labelled versions are never removed automatically
- Open **Version history** to see what changed in each version, compare a section with how it reads now, and restore a single section or the whole application
- **Undo AI rewrite** puts back the text a section had before the AI wrote over it; other sections are left alone
- Restoring is safe to try: your current text is kept as a version first, so you can change your mind
- If the same application is open in two tabs or windows, GrantWell merges your changes and asks you to review the sections you were not editing

### Two-Step Verification

- You can now add two-step verification to your account using an authenticator app
- Set it up from the prompt after you sign in, or any time from **Profile** under **Sign-in & security**
- Once it is on, you enter a 6-digit **Authentication code** from your app each time you sign in
- If you lose access to your authenticator app, contact support to have it reset

### Security Check on Sign In and Create Account

- **Sign in** and **Create account** now include a short security check that helps keep automated sign-ups out of GrantWell
- If the check cannot load, GrantWell tells you, and refreshing the page usually fixes it

## Improvements

### Grant Search

- Search results are now re-ordered by how closely each grant matches what you asked for, so the most relevant grants come first
- Searches that include extra words, such as "grants" or a state name, now still find grants whose names match most of your words
- Better handling of small typos in search terms

### Chat with AI

- Chats now use a newer AI model
- Longer answers are less likely to be cut off
- If something goes wrong while the AI is answering, the chat now stops and shows an error instead of waiting indefinitely
- Wide tables in answers scroll sideways instead of running off the screen

### Write Application

- AI-written applications now use the newer AI model
- Each section is written to fit the page or word limit the grant sets for it
- The AI no longer repeats your title and contact details in every section or adds summaries the grant did not ask for, and it leaves a **[BRACKETED PLACEHOLDER]** where it needs a figure or date from you instead of making one up
- Sections are no longer saved blank without warning: any section that could not be written is listed so you can retry it or write it yourself
- If writing your application stops partway, GrantWell now tells you instead of showing a progress bar that never finishes
- You can move back to any step you have already reached, and GrantWell reopens your application at the step you left it
- **Review** now lists any sections you have not opened yet, so nothing goes out unread
- If you choose supporting documents on the **Additional Information** step and then try to leave without uploading them, GrantWell asks whether to upload them first
- The save status next to each step now reads "Changes save automatically" until your first save, then "Saved"
- Contact names now accept accented letters and common name punctuation such as periods and commas
- Grants that come without application questions now let you continue straight to the next step

### Exports

- Word and PDF exports now keep the headings, lists, bold and italic text, and tables from your application, with borders on tables
- Word files now open cleanly in other word processors, not only Microsoft Word
- PDF exports of long applications are more reliable

### Recently Viewed Grants

- Your recently viewed grants on Home now follow you across devices and browsers, and the list shows up to six grants
- The "Last viewed" time is shown in a consistent, easier-to-read format

### Navigation and Wording

- The side menu and top bar now use the same names in the same order: **Home**, **My Chats**, **My Applications**, **Admin Dashboard**, and **Profile**
- When you have a grant selected, a **This Grant** group shows **Requirements**, **Chat with AI**, and **Write Application** for that grant
- The buttons on Home are now **Requirements**, **Write Application**, and **Chat with AI**, and Home shows which grant you have selected
- Wording is consistent everywhere: a funding opportunity is a "grant", what you write is an "application", your AI conversations are "chats", and files you upload are "supporting documents"
- Sign-in screens now say **Sign in** and **Create account**, and the code from your authenticator app is called the **Authentication code**
- Chats and applications are now listed by their title instead of an ID when you delete them
- Wide tables throughout GrantWell scroll sideways on small screens

### Help & Feedback

- **Help & feedback** is now available from the main menu on every page, with a short "Did you find what you were looking for?" question and room to tell us more
- If your feedback looks like it includes an email address or phone number, GrantWell reminds you that we can't reply to feedback and suggests removing it

### Account and Sign-In

- For security, you will now be asked to sign in again 7 days after you last signed in
- Changing or resetting your password now signs you out on every device, so only the new password works
- Account emails (verification codes and new-account invitations) are shorter and clearer, come from GrantWell, and replies go to support
- **Profile** is reorganized into **Account**, **Sign-in & security**, and **Notifications**, with links to jump to each

### Faster Pages

- The landing page loads noticeably faster, with smaller images and fonts served directly from GrantWell
- The landing page now appears straight away instead of after a loading spinner
- Returning visits load faster because more of the site is stored by your browser
- Links to pages that don't exist now show a clear "Page not found" message

## For Administrators

### User Management (Admin)

- New **Reset two-step verification** action for a user who has lost access to their authenticator app; it also signs them out everywhere, and they can set up a new app the next time they sign in
- Reset is available for the same users you can already edit, so state admins can reset users in their own state
- Roles are shown with readable names such as "Platform Admin"

### Grants (Admin)

- A grant can no longer be published without application questions; if questions could not be created, it goes to **Needs attention**, and approving it creates the questions
- The grant actions menu in the Admin Dashboard no longer gets cut off at the edge of the table
- Admin Dashboard screens now use the same wording as the rest of GrantWell

### Admin Dashboard Access (Admin)

- The admin section has been removed from Home; use **Admin Dashboard** in the main menu instead

# GrantWell v2.0.0

**Last Updated:** August 19, 2026

This release builds on GrantWell v1.0.0. Admins get an analytics dashboard, rebuilt grant processing, and tools scoped to their own state. Everyone can choose to get grant email digests. A one-time profile step helps us understand who uses GrantWell. The release also includes security improvements and accessibility fixes from our partner accessibility review.

## Highlights

- **Analytics** for admins: users, searches, popular grants, and application progress
- **Grant email digests**, daily or weekly, matched to your state and interests
- Rebuilt **grant processing** with live progress and a "Needs attention" review queue
- **State admins** manage their own state's grants and can add state guidance to federal grants
- A one-time **profile** step and a new **Profile** page with your recent activity
- **Custom questions**: admins can add their own questions to state grants
- **Security improvements** to access controls and email notifications
- **Accessibility improvements** from our partner accessibility review

## New in this release

### Analytics Dashboard (Admin)

- New **Analytics** tab in the Admin Dashboard for admins and developers
- See registered and active users per state, the most popular searches, the most viewed and most pursued grants, how many applications were drafted, completed, and downloaded, and usage by Department
- An **application funnel** shows how many applications are completed and how many are abandoned at each step
- Choose the last 7, 30, or 90 days. Developers and platform admins can view all states or pick one; state admins see their own state
- Only searches you actually submit are counted, not partial text as you type

### User Profiles

- The next time you sign in, you'll be asked once for your Department, organization, and role or title. Your state is shown, but an administrator assigns it
- New **Profile** page: manage your email preferences, see your recent applications, chats, and viewed grants, and update your organization details

### Grant Email Digests

- Choose a daily or weekly email listing new grants and grants closing soon
- Matched to your assigned state and the categories and keywords you choose
- Unsubscribe in one click, or change your preferences on your Profile page
- **Admin:** developers can preview digests and send them out

## Improvements

### Grant Processing (Admin)

- Each grant's row shows live processing progress, including grants still being processed and grants set aside for review
- A **"Needs attention"** queue in the Grants tab lists grants an admin should review before they are published
- If GrantWell can only read part of a grant, it can still publish it automatically, marked for review, instead of holding it back
- GrantWell is better at recognizing grant content and pulling out key details, and keeps working when one detail can't be worked out

### State-Scoped Administration (Admin)

- **State admins** can manage only their own state's grants. Every change is checked on the server
- Add state-specific guidance to a federal grant, shown only to your state's users
- Make a state copy of a federal grant

### Custom Questions on State Grants (Admin)

- Add, edit, and remove your own questions on a state grant (up to 25), each with optional help text
- Custom questions appear in the Write Application questionnaire next to the questions GrantWell found in the grant, and are labelled as custom
- Useful when a grant doesn't spell out what the funding agency wants applicants to address

### User Management (Admin)

- Admins can create and delete users, assign roles (User, Admin, Developer), and assign each user's state
- State admins see and manage only the users in their own state
- Clearer error messages in the User Management tab

### Security

- Unsubscribe links in digest emails are verified and expire
- Sign-in tokens are no longer written to system logs, and logs are kept for a set period instead of forever
- Tighter internal permissions for account creation

### Security (Admin)

- Platform-wide admin rights now come from an explicit Platform Admin role instead of being assumed
- State admins can't move a user to another state or give anyone platform-wide admin rights
- Every admin change to a grant is checked on the server to keep state admins within their own state

### Accessibility

- Keyboard navigation and focus fixes across GrantWell, including the main navigation, dialogs, and multi-step forms
- Color contrast fixes to meet WCAG 2.1 AA
- Better screen reader support: clearer labels, page landmarks, skip links, and announcements when a status changes
- If a chat response takes a long time, you now see a warning instead of it failing without notice
- The remaining issues from our partner accessibility review have been fixed

# GrantWell v1.0.0

**Last Updated:** May 13, 2026

GrantWell is an AI grant-writing assistant that helps you find, understand, and apply for state and federal grants. This is the first stable release, built in partnership with the Burnes Center for Social Change and the Massachusetts Federal Funds and Infrastructure Office.

## Highlights

- AI help at every step, from finding a grant to exporting your application
- Grants are added, summarized, and broken into requirements automatically
- **Chat with AI**, an AI assistant grounded in the grant you choose
- **Write Application**: section-by-section writing with progress tracking
- **Admin Dashboard** for managing grants, users, and the details GrantWell pulls from each grant

## Features

### Finding Grants

- Browse the grant catalog and search by keyword
- Includes federal grants from Grants.gov
- State grants can also be added by hand
- Each state can add its own grants, visible only to that state's users
- Supports grants with rolling deadlines
- Filter by status, grant type, and category

### Requirements

- GrantWell reads each grant automatically and records its status, funding agency, grant type, category, and deadline
- AI summaries of eligibility, required documents, narrative sections, and deadlines

### Chat with AI

- Chat with AI to help write the narrative sections of your application
- Answers are based on the grant you selected and the supporting documents you upload
- Your chats are saved for each grant and visible only to you

> **Note:** Always review and fact-check AI-generated content before you submit.

### Write Application

- Write and refine your application section by section
- Track your progress across sections
- Export your completed application as DOCX or PDF

### Admin Dashboard (Admin)

- Manage grants, including status, funding agency, and rolling deadlines
- Grants are pulled from Grants.gov automatically
- Invite new users by sending them an access link
- Separate permissions for admin users

## Accessibility

- Conforms to WCAG 2.1 Level AA, including screen reader support, keyboard navigation, and enough color contrast
- Checked with automated accessibility testing (Axe)

## Security

- Secure sign-in, and you can create your own account
- Role-based permissions, including admin roles
- Data is encrypted in transit and at rest
- Uploaded files are checked, and PDF is the preferred format

## Known Limitations

- GrantWell works, but has had limited user testing. Please report problems through the feedback form in GrantWell.
- ZIP files can't be uploaded.

## Acknowledgments

GrantWell was built by the AI For Impact Team in partnership with the Massachusetts Federal Funds and Infrastructure Office.
