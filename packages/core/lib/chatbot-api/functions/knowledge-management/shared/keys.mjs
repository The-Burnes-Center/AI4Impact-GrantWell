/**
 * Key checks for user-document Lambdas. Keys are "<userId>/<grant name>/<file>".
 * S3 stores "." and ".." segments literally, so a prefix check alone would let
 * "<me>/../<other>/x" through to anything that later normalizes the path.
 */

export function isOwnKey(key, userId) {
  if (typeof key !== 'string' || !userId || !key.startsWith(`${userId}/`)) return false;
  return !key.split('/').some((segment) => segment === '.' || segment === '..');
}

export function hasCleanSegments(key) {
  return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
