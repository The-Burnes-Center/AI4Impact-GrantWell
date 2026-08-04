/**
 * Whether it is safe to delete the conditionally claimed `newName` metadata row on rename failure.
 * Once source S3 objects have been mutated, rolling back that claim can leave the grant with
 * content only under `newName/` and no DynamoDB row at all.
 */
export function canSafelyRollbackRenameClaim(claimedNewRow, sourceMutated) {
  return Boolean(claimedNewRow) && !sourceMutated;
}
