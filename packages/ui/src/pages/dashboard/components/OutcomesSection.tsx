import { useEffect, useMemo, useState } from "react";
import { LuDownload } from "react-icons/lu";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { AdminOutcome } from "../../../common/api-client/outcomes-client";
import {
  OUTCOME_LABELS,
  OUTCOME_STATUSES,
  formatDollars,
  type OutcomeStatus,
} from "../../../common/application-outcomes";
import { REGIONS } from "../../../common/instance";
import { formatDeadline } from "../../../components/outcomes/format";
import TableScrollRegion from "../../../components/ui/TableScrollRegion";
import { outcomesCsv } from "./outcomes-csv";

interface OutcomesSectionProps {
  apiClient: ApiClient;
  /** "" = every state the caller may see; the server pins state admins to their own. */
  state: string;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

const PAGE = 50;

function download(name: string, text: string) {
  // The BOM makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OutcomesSection({ apiClient, state, addNotification }: OutcomesSectionProps) {
  const [rows, setRows] = useState<AdminOutcome[] | null>(null);
  const [status, setStatus] = useState<OutcomeStatus | "">("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let active = true;
    setRows(null);
    apiClient.outcomes
      .adminList(state || undefined)
      .then((r) => active && setRows(r))
      .catch(() => {
        if (!active) return;
        setRows([]);
        addNotification("error", "Failed to load application outcomes.");
      });
    return () => {
      active = false;
    };
  }, [apiClient, state, addNotification]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!q || [o.email, o.organization, o.grant, o.title, o.region].some((v) => v.toLowerCase().includes(q)))
    );
  }, [rows, status, query]);

  const totals = useMemo(() => {
    const all = rows ?? [];
    const count = (s: OutcomeStatus) => all.filter((o) => o.status === s).length;
    const awardedSum = all.reduce((sum, o) => sum + (o.status === "awarded" ? o.amountAwarded ?? 0 : 0), 0);
    return { all: all.length, awarded: count("awarded"), notAwarded: count("not_awarded"), waiting: count("submitted"), awardedSum };
  }, [rows]);

  const exportCsv = () => {
    download(`application-outcomes-${new Date().toISOString().slice(0, 10)}.csv`, outcomesCsv(filtered));
  };

  return (
    <section className="analytics__card analytics__outcomes" aria-labelledby="outcomes-title">
      <div className="analytics__card-head analytics__outcomes-head">
        <div>
          <h3 className="analytics__card-title" id="outcomes-title">
            Application outcomes
          </h3>
          <p className="analytics__card-sub">
            All time, as users recorded them. Outcomes from deleted accounts stay, without the user.
          </p>
        </div>
        <button
          type="button"
          className="analytics__window-btn"
          onClick={exportCsv}
          disabled={!rows || filtered.length === 0}
        >
          <LuDownload size={14} aria-hidden="true" /> Export CSV{filtered.length !== totals.all ? ` (${filtered.length} shown)` : ""}
        </button>
      </div>

      {rows === null ? (
        <div role="status" className="no-data">
          Loading outcomes
        </div>
      ) : rows.length === 0 ? (
        <div className="no-data">No outcomes recorded yet.</div>
      ) : (
        <>
          <div className="metrics-grid">
            <Tile label="Outcomes recorded" value={totals.all.toLocaleString()} />
            <Tile label="Awarded" value={totals.awarded.toLocaleString()} />
            <Tile label="Total awarded" value={formatDollars(totals.awardedSum)} />
            <Tile label="Waiting to hear" value={totals.waiting.toLocaleString()} />
            <Tile label="Not awarded" value={totals.notAwarded.toLocaleString()} />
          </div>

          <div className="analytics__outcomes-filters">
            <label className="visually-hidden" htmlFor="outcomes-status">
              Filter by outcome
            </label>
            <select
              id="outcomes-status"
              className="analytics__state-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OutcomeStatus | "");
                setShown(PAGE);
              }}
            >
              <option value="">All outcomes</option>
              {OUTCOME_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OUTCOME_LABELS[s]}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor="outcomes-search">
              Search outcomes
            </label>
            <input
              id="outcomes-search"
              type="search"
              className="analytics__state-select"
              placeholder="Search grant, organization, email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
            />
          </div>

          <TableScrollRegion label="Application outcomes table" minWidth={900}>
            <table className="analytics__table">
              <thead>
                <tr>
                  <th scope="col">Grant</th>
                  <th scope="col">Organization</th>
                  {REGIONS.length > 0 && <th scope="col">Region</th>}
                  <th scope="col">User</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="analytics__num">Requested</th>
                  <th scope="col" className="analytics__num">Awarded</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((o, i) => (
                  <tr key={`${o.grant}-${o.updatedAt}-${i}`}>
                    <td>
                      {o.grant}
                      {o.title && <div className="analytics__card-sub">{o.title}</div>}
                    </td>
                    <td>{o.organization || "—"}</td>
                    {REGIONS.length > 0 && <td>{o.region || "—"}</td>}
                    <td>{o.deleted ? "Deleted account" : o.email || "—"}</td>
                    <td>{OUTCOME_LABELS[o.status] ?? o.status}</td>
                    <td className="analytics__num">{o.requestedAmount || "—"}</td>
                    <td className="analytics__num">{o.amountAwarded === null ? "—" : formatDollars(o.amountAwarded)}</td>
                    <td>{o.decisionDate ? formatDeadline(o.decisionDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollRegion>
          {filtered.length === 0 && <div className="no-data">No outcomes match.</div>}
          {filtered.length > shown && (
            <button type="button" className="analytics__window-btn" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length - shown}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card" aria-label={`${label}: ${value}`}>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__label">{label}</div>
    </div>
  );
}
