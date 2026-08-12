import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const SUPPORTED_STATE_CODES = new Set(
  JSON.parse(process.env.SUPPORTED_STATES || "[]").map((s) =>
    String(s.code).toUpperCase()
  )
);

function normalizeState(clientMetadata) {
  const raw = clientMetadata?.state;
  if (typeof raw !== "string") return "";
  const upper = raw.trim().toUpperCase();
  return SUPPORTED_STATE_CODES.has(upper) ? upper : "";
}

function rejectsUnsupportedState(clientMetadata) {
  const raw = clientMetadata?.state;
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return trimmed !== "" && !SUPPORTED_STATE_CODES.has(trimmed.toUpperCase());
}

export const handler = async (event) => {
  if (event.triggerSource === "PreSignUp_SignUp") {
    // Fail fast on a tampered picker value rather than silently dropping it at confirmation.
    if (rejectsUnsupportedState(event.request.clientMetadata)) {
      throw new Error("Select a supported state.");
    }
    return event;
  }

  if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
    const state = normalizeState(event.request.clientMetadata);
    if (!state) return event;

    try {
      await cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: event.userPoolId,
          Username: event.userName,
          UserAttributes: [{ Name: "custom:state", Value: state }],
        })
      );
    } catch (error) {
      console.error("Failed to set custom:state at confirmation", {
        username: event.userName,
        state,
        error: error?.message,
      });
    }
    return event;
  }

  return event;
};
