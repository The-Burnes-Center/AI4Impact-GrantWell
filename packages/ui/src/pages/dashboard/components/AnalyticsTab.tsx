import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";
import type { ApiClient } from "../../../common/api-client/api-client";
import type {
  AnalyticsData,
  AnalyticsWindow,
  RankedItem,
} from "../../../common/api-client/analytics-client";
import { SINGLE_STATE, SUPPORTED_STATES, stateNameFromCode } from "../../../common/states";
import { DEFAULT_COLORS, contrastRatio, mix } from "../../../common/palette";
import OutcomesSection from "./OutcomesSection";
import "../../../styles/analytics.css";

interface AnalyticsTabProps {
  apiClient: ApiClient;
  addNotification: (
    type: "success" | "error" | "info" | "warning",
    message: string
  ) => void;
  // State admins are locked to their own state (no filter shown); developers/regular admins may
  // narrow the all-states view to one state.
  isStateAdmin: boolean;
  userState: string;
}

// Recharts needs literal colors, so the branded tokens are read at render. Fills are primary, primary-active
// or a mix of the two; the palette rules hold both at 4.5:1 on white and a mix is never lighter than its ends.
const HEX = /^#[0-9a-f]{6}$/i;
const cssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return HEX.test(value) ? value : fallback;
};

const WHITE = "#FFFFFF"; // color-lint-allow
const FUNNEL_STEPS = 7;

/** Darkens a palette that skipped the brand contrast check until it holds 3:1 on white. */
function onWhite(color: string): string {
  let shade = color;
  for (let weight = 0.1; contrastRatio(shade, WHITE) < 3 && weight <= 1; weight += 0.1) {
    shade = mix(color, "#000000", weight); // color-lint-allow
  }
  return shade;
}

function chartColors() {
  const primary = onWhite(cssVar("--gw-color-primary", DEFAULT_COLORS.primary));
  const primaryActive = onWhite(cssVar("--gw-color-primary-active", DEFAULT_COLORS.primaryActive));
  return {
    registered: primaryActive,
    active: primary,
    single: primary,
    // Sequential ramp for the ordered funnel, primary → primary-active.
    funnel: Array.from({ length: FUNNEL_STEPS }, (_, i) => mix(primary, primaryActive, i / (FUNNEL_STEPS - 1))),
  };
}
const AXIS_INK = "#52514e";
const GRID = "#e1e0d9";

const WINDOWS: AnalyticsWindow[] = [7, 30, 90];

const STAGE_LABELS: Record<string, string> = {
  project_basics: "Project Basics",
  questionnaire: "Questionnaire",
  uploading_documents: "Additional Information",
  generating_draft: "Generating draft",
  editing_sections: "Section Editor",
  reviewing: "Review",
  submitted: "Submitted",
};

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  apiClient,
  addNotification,
  isStateAdmin,
  userState,
}) => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [windowDays, setWindowDays] = useState<AnalyticsWindow>(30);
  // "" = all states. State admins are pinned to their own state and can't change it.
  const [stateFilter, setStateFilter] = useState<string>(
    isStateAdmin ? userState : ""
  );
  const [loading, setLoading] = useState(true);
  const colors = useMemo(chartColors, []);
  const hatchId = `analytics-hatch-${useId().replace(/:/g, "")}`;

  const fetchAnalytics = useCallback(
    async (w: AnalyticsWindow, state: string) => {
      setLoading(true);
      try {
        const result = await apiClient.analytics.getAnalytics(
          w,
          state || undefined
        );
        setData(result);
      } catch {
        addNotification("error", "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    },
    [apiClient, addNotification]
  );

  useEffect(() => {
    fetchAnalytics(windowDays, stateFilter);
  }, [fetchAnalytics, windowDays, stateFilter]);

  return (
    <div className="analytics">
      <div className="analytics__toolbar">
        <p className="analytics__caption">
          {isStateAdmin
            ? `Usage for ${stateNameFromCode(userState) || userState}. Metrics accrue from launch onward.`
            : "Usage across your instance. Metrics accrue from launch onward."}
        </p>
        <div className="analytics__controls">
          {!isStateAdmin && !SINGLE_STATE && (
            <div className="analytics__state">
              <label className="visually-hidden" htmlFor="analytics-state">
                Filter by state
              </label>
              <select
                id="analytics-state"
                className="analytics__state-select"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="">All states</option>
                {SUPPORTED_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div
            className="analytics__window"
            role="group"
            aria-label="Time window"
          >
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={`analytics__window-btn ${
                  windowDays === w ? "analytics__window-btn--active" : ""
                }`}
                aria-pressed={windowDays === w}
                onClick={() => setWindowDays(w)}
              >
                Last {w} days
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="metrics-grid" aria-busy="true">
          <span role="status" className="visually-hidden">Loading analytics</span>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="metric-card metric-card--skeleton" />
          ))}
        </div>
      ) : !data ? (
        <div className="no-data">No analytics available.</div>
      ) : (
        <div className="analytics__body" aria-busy={loading}>
          {/* Headline scalars */}
          <div className="metrics-grid">
            <StatTile label="Registered users" value={data.totalRegistered} />
            <StatTile
              label={`Active (last ${data.window}d)`}
              value={data.activeUsers}
            />
            <StatTile label="Applications created" value={data.draftsCreated} />
            <StatTile label="Applications completed" value={data.draftsCompleted} />
            <StatTile label="Applications downloaded" value={data.draftsDownloaded} />
          </div>

          {/* Users by state — 2 series (registered vs active) */}
          <ChartCard
            title="Users by state"
            subtitle={`Registered and active (active = signed in within ${data.window} days)`}
            empty={data.usersByState.length === 0}
          >
            <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={colors.active} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={WHITE} strokeWidth="2" />
                </pattern>
              </defs>
            </svg>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                accessibilityLayer={false}
                data={data.usersByState.map((s) => ({
                  name: s.stateName || s.state,
                  Registered: s.registered,
                  Active: s.active,
                }))}
                margin={{ top: 16, right: 12, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: AXIS_INK, fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS_INK, fontSize: 12 }} />
                <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                <Legend />
                <Bar dataKey="Registered" fill={colors.registered} radius={[4, 4, 0, 0]} maxBarSize={44}>
                  <LabelList dataKey="Registered" position="top" style={{ fill: AXIS_INK, fontSize: 11 }} />
                </Bar>
                <Bar dataKey="Active" fill={`url(#${hatchId})`} stroke={colors.active} radius={[4, 4, 0, 0]} maxBarSize={44}>
                  <LabelList dataKey="Active" position="top" style={{ fill: AXIS_INK, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <VisuallyHiddenTable
              caption="Users by state"
              columns={["State", "Registered", "Active"]}
              rows={data.usersByState.map((s) => [
                s.stateName || s.state,
                String(s.registered),
                String(s.active),
              ])}
            />
          </ChartCard>

          {/* Grant application funnel — abandonment / completion */}
          <ChartCard
            title="Grant application funnel"
            subtitle={
              data.draftFunnel.total > 0
                ? `${data.draftFunnel.completed} of ${data.draftFunnel.total} submitted · ${data.draftFunnel.completionRate}% completion · ${data.draftFunnel.abandoned} in progress or abandoned`
                : undefined
            }
            empty={data.draftFunnel.total === 0}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                accessibilityLayer={false}
                layout="vertical"
                data={data.draftFunnel.stages.map((s) => ({
                  name: STAGE_LABELS[s.stage] || s.stage,
                  count: s.count,
                }))}
                margin={{ top: 8, right: 40, bottom: 4, left: 16 }}
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_INK, fontSize: 12 }} />
                {/* Wide enough that no stage name wraps: recharts splits a wrapped label into tspans with no space between. */}
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fill: AXIS_INK, fontSize: 12 }}
                />
                <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {data.draftFunnel.stages.map((_, i) => (
                    <Cell key={i} fill={colors.funnel[i] || colors.single} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: AXIS_INK, fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <VisuallyHiddenTable
              caption="Grant application funnel"
              columns={["Stage", "Applications"]}
              rows={data.draftFunnel.stages.map((s) => [
                STAGE_LABELS[s.stage] || s.stage,
                String(s.count),
              ])}
            />
          </ChartCard>

          {/* Ranked text lists — tables read better than bars for these */}
          <div className="analytics__grid-2">
            <RankedTable
              title="Top search queries"
              itemHeader="Query"
              items={data.topSearches}
            />
            <RankedTable
              title="Most viewed grants"
              itemHeader="Grant"
              items={data.topViewedNofos}
            />
            <RankedTable
              title="Most pursued grants"
              itemHeader="Grant"
              items={data.topPursuedNofos}
            />
            <UsageByAgencyTable data={data} />
          </div>
        </div>
      )}

      <OutcomesSection apiClient={apiClient} state={stateFilter} addNotification={addNotification} />
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <div className="metric-card">
    <div className="metric-card__value">{value.toLocaleString()}</div>
    <div className="metric-card__label">{label}</div>
  </div>
);

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, empty, children }) => (
  <section className="analytics__card">
    <div className="analytics__card-head">
      <h3 className="analytics__card-title">{title}</h3>
      {subtitle && <p className="analytics__card-sub">{subtitle}</p>}
    </div>
    {empty ? (
      <div className="no-data">No data yet for this period.</div>
    ) : (
      children
    )}
  </section>
);

const RankedTable: React.FC<{
  title: string;
  itemHeader: string;
  items: RankedItem[];
}> = ({ title, itemHeader, items }) => (
  <section className="analytics__card">
    <div className="analytics__card-head">
      <h3 className="analytics__card-title">{title}</h3>
    </div>
    {items.length === 0 ? (
      <div className="no-data">No data yet.</div>
    ) : (
      <table className="analytics__table">
        <thead>
          <tr>
            <th scope="col">{itemHeader}</th>
            <th scope="col" className="analytics__num">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.label}>
              <td>{it.label}</td>
              <td className="analytics__num">{it.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

const UsageByAgencyTable: React.FC<{ data: AnalyticsData }> = ({ data }) => (
  <section className="analytics__card">
    <div className="analytics__card-head">
      <h3 className="analytics__card-title">Usage by department</h3>
      <p className="analytics__card-sub">Activity volume, grouped by user department</p>
    </div>
    {data.usageByAgency.length === 0 ? (
      <div className="no-data">No data yet.</div>
    ) : (
      <table className="analytics__table">
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">State</th>
            <th scope="col" className="analytics__num">
              Events
            </th>
          </tr>
        </thead>
        <tbody>
          {data.usageByAgency.map((a) => (
            <tr key={`${a.state}-${a.agency}`}>
              <td>{a.agency}</td>
              <td>{a.state || "Not assigned"}</td>
              <td className="analytics__num">{a.events.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

// Screen-reader / relief table equivalent for each chart (dataviz accessibility pass).
const VisuallyHiddenTable: React.FC<{
  caption: string;
  columns: string[];
  rows: string[][];
}> = ({ caption, columns, rows }) => (
  <table className="visually-hidden">
    <caption>{caption}</caption>
    <thead>
      <tr>
        {columns.map((c) => (
          <th key={c} scope="col">
            {c}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          {r.map((cell, j) => (
            <td key={j}>{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default AnalyticsTab;
