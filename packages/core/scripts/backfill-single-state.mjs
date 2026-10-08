#!/usr/bin/env node
/**
 * Gives every user in a single-state deployment's pool that state (custom:state), whatever their
 * role: on a single-state deployment everyone belongs to the state. New users get it at sign-up
 * and stragglers at their next sign-in; this fills in everyone at once after the first deploy.
 * A state-less Admin becomes that state's admin.
 *
 * Dry run (default):
 *   node scripts/backfill-single-state.mjs --user-pool-id us-east-1_XXXX --state MA --region us-east-1
 * Apply:
 *   node scripts/backfill-single-state.mjs --user-pool-id us-east-1_XXXX --state MA --apply
 */

import { fileURLToPath } from "node:url";
import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

function attr(user, name) {
  return (user.Attributes || []).find((a) => a.Name === name)?.Value || "";
}

/** The users whose custom:state isn't `state` yet, with what they have now. */
export function planBackfill(users, state) {
  return users
    .map((user) => ({ username: user.Username, email: attr(user, "email"), current: attr(user, "custom:state").trim() }))
    .filter((user) => user.current.toUpperCase() !== state);
}

function parseArgs(argv) {
  const args = { apply: false, region: process.env.AWS_REGION || "us-east-1" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--user-pool-id") args.userPoolId = argv[++i];
    else if (arg === "--state") args.state = String(argv[++i] || "").trim().toUpperCase();
    else if (arg === "--region") args.region = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.userPoolId || !/^[A-Z]{2}$/.test(args.state || "")) {
    console.error("--user-pool-id and --state <two-letter code> are required");
    process.exit(1);
  }
  return args;
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
  const plan = planBackfill(users, args.state);

  console.log(`Pool ${args.userPoolId} (${args.region}): ${users.length} users scanned, ${plan.length} to set to ${args.state}.`);
  const byCurrent = plan.reduce((acc, u) => ({ ...acc, [u.current || "(none)"]: (acc[u.current || "(none)"] || 0) + 1 }), {});
  for (const [current, count] of Object.entries(byCurrent)) console.log(`  from ${current}: ${count}`);

  if (!args.apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  let failed = 0;
  for (const user of plan) {
    try {
      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: args.userPoolId,
          Username: user.username,
          UserAttributes: [{ Name: "custom:state", Value: args.state }],
        })
      );
    } catch (error) {
      failed += 1;
      console.error(`  failed: ${user.username}: ${error?.message}`);
    }
  }
  console.log(`\nSet ${plan.length - failed} of ${plan.length}; ${failed} failed.`);
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
