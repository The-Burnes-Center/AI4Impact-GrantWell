#!/usr/bin/env node
/**
 * Migrates legacy platform admins (custom:role=["Admin"] with no custom:state) to the explicit
 * custom:role=["PlatformAdmin"], so platform-wide authority is asserted rather than inferred
 * from a missing state claim.
 *
 * Run this against every pool BEFORE flipping LEGACY_STATELESS_ADMIN_IS_PLATFORM to "false"
 * in lib/chatbot-api/functions/functions.ts and lib/chatbot-api/index.ts. Unmigrated accounts
 * lose cross-state access once that flag is off.
 *
 * Dry run (default):
 *   node scripts/migrate-platform-admins.mjs --user-pool-id us-east-1_XXXX --region us-east-1
 * Apply:
 *   node scripts/migrate-platform-admins.mjs --user-pool-id us-east-1_XXXX --apply
 */

import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

function parseArgs(argv) {
  const args = { apply: false, region: process.env.AWS_REGION || "us-east-1" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--user-pool-id") args.userPoolId = argv[++i];
    else if (arg === "--region") args.region = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.userPoolId) {
    console.error("--user-pool-id is required");
    process.exit(1);
  }
  return args;
}

function parseRoles(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : [];
  } catch {
    return [raw];
  }
}

function attr(user, name) {
  return (user.Attributes || []).find((a) => a.Name === name)?.Value || "";
}

async function listAllUsers(client, userPoolId) {
  const users = [];
  let paginationToken;
  do {
    const response = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 60,
        ...(paginationToken ? { PaginationToken: paginationToken } : {}),
      })
    );
    users.push(...(response.Users || []));
    paginationToken = response.PaginationToken;
  } while (paginationToken);
  return users;
}

async function main() {
  const args = parseArgs(process.argv);
  const client = new CognitoIdentityProviderClient({ region: args.region });

  const users = await listAllUsers(client, args.userPoolId);
  const candidates = users.filter((user) => {
    const roles = parseRoles(attr(user, "custom:role"));
    const state = attr(user, "custom:state").trim();
    return roles.includes("Admin") && !roles.includes("PlatformAdmin") && !state;
  });

  console.log(`Pool ${args.userPoolId} (${args.region}): ${users.length} users scanned.`);
  console.log(`${candidates.length} legacy platform admin(s) to migrate:\n`);
  for (const user of candidates) {
    console.log(`  ${user.Username}  <${attr(user, "email") || "no email"}>`);
  }

  if (candidates.length === 0) {
    console.log("\nNothing to migrate. Safe to flip LEGACY_STATELESS_ADMIN_IS_PLATFORM for this pool.");
    return;
  }

  if (!args.apply) {
    console.log("\nDry run. Re-run with --apply to write custom:role=[\"PlatformAdmin\"].");
    return;
  }

  let migrated = 0;
  for (const user of candidates) {
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: args.userPoolId,
        Username: user.Username,
        UserAttributes: [
          { Name: "custom:role", Value: JSON.stringify(["PlatformAdmin"]) },
          { Name: "custom:state", Value: "" },
        ],
      })
    );
    migrated += 1;
    console.log(`  migrated ${user.Username}`);
  }

  console.log(`\n${migrated} account(s) migrated.`);
  console.log("Migrated users must sign out and back in to pick up the new role claim.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
