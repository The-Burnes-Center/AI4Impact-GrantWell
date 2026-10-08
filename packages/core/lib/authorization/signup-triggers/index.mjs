import {
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { isE2EBypass } from "./e2e-bypass.mjs";
import { assertTurnstileToken } from "./turnstile.mjs";

// Bounded so a slow Cognito call ends inside the trigger's 4 s Lambda timeout.
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 },
});

const SUPPORTED_STATE_CODES = new Set(
  JSON.parse(process.env.SUPPORTED_STATES || "[]").map((s) =>
    String(s.code).toUpperCase()
  )
);

// Set on a deployment with no bot check; a missing secret without it still rejects (fail closed).
const BOT_CHECK_OFF = process.env.TURNSTILE_DISABLED === "true";
// A single-state deployment's code: every user belongs to it, whatever the client sends.
const SINGLE_STATE = String(process.env.SINGLE_STATE || "").toUpperCase();

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
    if (!BOT_CHECK_OFF) {
      await assertTurnstileToken(
        event.request.clientMetadata,
        event.request.userContextData?.ipAddress
      );
    }

    if (rejectsUnsupportedState(event.request.clientMetadata)) {
      throw new Error("Select a supported state.");
    }
    return event;
  }

  if (event.triggerSource === "PreAuthentication_Authentication") {
    if (!BOT_CHECK_OFF && !(await isE2EBypass(event.request.validationData, event.request.userAttributes?.email))) {
      await assertTurnstileToken(
        event.request.validationData,
        event.request.userContextData?.ipAddress
      );
    }
    await fillInSingleState(event);
    return event;
  }

  if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
    const state = SINGLE_STATE || normalizeState(event.request.clientMetadata);
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

  // ConfirmForgotPassword leaves existing refresh tokens valid, and this is the only hook on that flow.
  if (event.triggerSource === "PostConfirmation_ConfirmForgotPassword") {
    try {
      await cognitoClient.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: event.userPoolId,
          Username: event.userName,
        })
      );
    } catch (error) {
      console.error("Failed to revoke sessions after password reset", {
        username: event.userName,
        error: error?.message,
      });
    }
    return event;
  }

  return event;
};

// Users from before a deployment became single-state, or made in the console, get the state on
// their next sign-in. Fails open: the backfill script covers anyone this misses.
async function fillInSingleState(event) {
  if (!SINGLE_STATE) return;
  const current = String(event.request.userAttributes?.["custom:state"] || "").trim().toUpperCase();
  if (current === SINGLE_STATE) return;
  try {
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        UserAttributes: [{ Name: "custom:state", Value: SINGLE_STATE }],
      })
    );
  } catch (error) {
    console.error("Could not fill in custom:state at sign-in", {
      username: event.userName,
      error: error?.message,
    });
  }
}
