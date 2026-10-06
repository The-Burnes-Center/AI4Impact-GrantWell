import { useEffect, useId, useMemo, useState } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { fetchRecentlyViewed } from "../../common/helpers/recently-viewed-nofos";
import type { RawNOFOData } from "../../common/types/document";
import Modal from "./Modal";

export interface PickedGrant {
  label: string;
  value: string;
}

interface GrantPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (grant: PickedGrant) => void;
  title: string;
  description: string;
  busy?: boolean;
}

export default function GrantPickerModal({
  isOpen,
  onClose,
  onSelect,
  title,
  description,
  busy = false,
}: GrantPickerModalProps) {
  const apiClient = useApiClient();
  const [grants, setGrants] = useState<PickedGrant[]>([]);
  const [recentValues, setRecentValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchId = useId();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setQuery("");
    setLoading(true);
    setError(null);
    Promise.all([apiClient.landingPage.getNOFOs(), fetchRecentlyViewed()])
      .then(([result, recents]) => {
        if (cancelled) return;
        const names: string[] = result.nofoData
          ? result.nofoData
              .filter((nofo: RawNOFOData) => !nofo.processing_status && nofo.status === "active")
              .map((nofo: RawNOFOData) => nofo.name)
          : result.folders || [];
        names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        setGrants(names.map((name) => ({ label: name, value: name + "/" })));
        setRecentValues(recents.map((r) => r.value));
      })
      .catch((err) => {
        console.error("Error retrieving NOFOs:", err);
        if (!cancelled) setError("Failed to load grants. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiClient]);

  const { recent, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? grants.filter((g) => g.label.toLowerCase().includes(q)) : grants;
    const byValue = new Map(matches.map((g) => [g.value, g]));
    const recentGrants = recentValues
      .map((v) => byValue.get(v))
      .filter((g): g is PickedGrant => !!g);
    const recentSet = new Set(recentGrants.map((g) => g.value));
    return { recent: recentGrants, rest: matches.filter((g) => !recentSet.has(g.value)) };
  }, [grants, recentValues, query]);

  const renderList = (items: PickedGrant[]) => (
    <ul className="grant-picker-list">
      {items.map((grant) => (
        <li key={grant.value}>
          <button
            type="button"
            className="grant-picker-item"
            onClick={() => onSelect(grant)}
            disabled={busy}
          >
            {grant.label}
          </button>
        </li>
      ))}
    </ul>
  );

  const noMatches = !loading && !error && recent.length === 0 && rest.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="600px">
      <p className="grant-picker-description">{description}</p>
      <label htmlFor={searchId} className="visually-hidden">
        Filter grants by name
      </label>
      <input
        id={searchId}
        type="search"
        className="form-input"
        placeholder="Filter grants by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading}
        autoComplete="off"
      />
      <div className="grant-picker-results" aria-busy={loading || busy}>
        {loading && <p className="grant-picker-status">Loading grants…</p>}
        {error && (
          <p className="grant-picker-status" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p className="grant-picker-status" role="status">
            Starting…
          </p>
        )}
        {recent.length > 0 && (
          <>
            <h3 className="grant-picker-heading">Recently viewed</h3>
            {renderList(recent)}
          </>
        )}
        {rest.length > 0 && (
          <>
            {recent.length > 0 && <h3 className="grant-picker-heading">All grants</h3>}
            {renderList(rest)}
          </>
        )}
        {noMatches && (
          <p className="grant-picker-status" role="status">
            {query ? "No grants match that name." : "No grants are available right now."}
          </p>
        )}
      </div>
    </Modal>
  );
}
