/**
 * Email templates for user invitations
 */

export const EMAIL_TEMPLATES = {
  /**
   * HTML template for user invitation emails
   */
  USER_INVITATION_HTML: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GrantWell Grant Writing Assistant Credentials</title>
</head>
<body>
    <p>Hello,</p>
    <p>I am pleased to inform you that the new custom deployment link for the Your tool is now ready for testing. All future updates and changes will be applied to this new link. Please note that the tool is still under development, so you may encounter errors. We kindly request that you record any feedback regarding the tool's performance. Below, you will find the necessary information for signing into the tool.</p>
    <p>When signing in for the first time, please use this link: <a href="https://{cognito_domain}/login?client_id={client_id}&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+phone+profile&redirect_uri={redirect_uri}">First Time Sign-In Link</a></p>
    <p>Once you are registered, you can use the regular custom deployment link: <a href="{app_url}">Regular Custom Deployment Link</a></p>
    <p>Username: {{'{'+'username'+'}'}}</p>
    <p>Temporary Password: {{'{'+'####'+'}'}}</p>
</body>
</html>`
};

/**
 * Configuration values that should be replaced in the templates
 */
export const EMAIL_CONFIG = {
  COGNITO_DOMAIN: "gw-stack-auth.auth.us-east-1.amazoncognito.com",
  CLIENT_ID: "375cvc5uaol6jm9jm1jte11kpr",
  REDIRECT_URI: "https://d1rj02c84jtl1i.cloudfront.net/",
  APP_URL: "https://d1rj02c84jtl1i.cloudfront.net/"
};

/**
 * Helper function to replace configuration values in email templates
 */
export function getConfiguredEmailTemplate(template: string): string {
  return template
    .replace(/{cognito_domain}/g, EMAIL_CONFIG.COGNITO_DOMAIN)
    .replace(/{client_id}/g, EMAIL_CONFIG.CLIENT_ID)
    .replace(/{redirect_uri}/g, EMAIL_CONFIG.REDIRECT_URI)
    .replace(/{app_url}/g, EMAIL_CONFIG.APP_URL);
} 