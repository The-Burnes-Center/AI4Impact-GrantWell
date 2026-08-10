/**
 * Section-map merge rules for the draft save path.
 *
 * A draft write replaces the whole `sections` map, and the client's map is
 * authoritative for everything it holds — including sections restored from the
 * local cache that were never marked dirty. So a losing writer cannot simply
 * send its dirty sections and let the server keep the rest; it has to send a
 * full map with the winner's sections folded back in, and keep folding them in
 * until the user edits those sections themselves.
 *
 * Kept free of imports so it can be exercised directly by the root jest suite.
 */

export type SectionMap = Record<string, string>;

/**
 * Union of a remote writer's sections and the ones this client changed, with
 * the client winning only where it is dirty.
 */
export function mergeSectionMaps(
  remote: SectionMap | undefined,
  local: SectionMap | undefined,
  dirtySections: Iterable<string>
): SectionMap {
  const merged: SectionMap = { ...(remote || {}) };
  for (const name of dirtySections) {
    if (local && name in local) merged[name] = local[name];
  }
  return merged;
}

/**
 * Sections another writer changed under us: present in `remote` with a value
 * this client has not seen the server report, and not dirty here.
 *
 * Comparing against the last server-reported map rather than against the
 * client's own map matters — the two differ for locally cached edits that were
 * never flushed, and those are the client's to keep, not the remote's to claim.
 */
export function remoteOwnedSections(
  remote: SectionMap | undefined,
  lastKnownServer: SectionMap | undefined,
  dirtySections: Iterable<string>
): SectionMap {
  const dirty = new Set(dirtySections);
  const owned: SectionMap = {};
  for (const [name, text] of Object.entries(remote || {})) {
    if (dirty.has(name)) continue;
    if (lastKnownServer && lastKnownServer[name] === text) continue;
    owned[name] = text;
  }
  return owned;
}

/**
 * Re-apply remote-owned sections over the map this client is about to write.
 * A section drops out of `remoteOwned` once the client marks it dirty, so an
 * edit by this user still wins.
 */
export function applyRemoteSections(
  sections: SectionMap,
  remoteOwned: SectionMap,
  dirtySections: Iterable<string>
): SectionMap {
  const names = Object.keys(remoteOwned);
  if (names.length === 0) return sections;

  const dirty = new Set(dirtySections);
  const result: SectionMap = { ...sections };
  for (const name of names) {
    if (!dirty.has(name)) result[name] = remoteOwned[name];
  }
  return result;
}
