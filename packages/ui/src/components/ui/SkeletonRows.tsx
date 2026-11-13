const WIDTHS = ["72%", "56%", "64%", "48%", "68%"];

interface SkeletonRowsProps {
  /** Accessible name, e.g. "Loading your applications". */
  label: string;
  rows?: number;
  /** Also speak the label, for lists with no live region of their own. */
  announce?: boolean;
}

/** Placeholder rows that keep a list's shape while it loads. */
export default function SkeletonRows({ label, rows = 5, announce }: SkeletonRowsProps) {
  return (
    <div className="gw-skeleton" role="status" aria-label={label}>
      {announce && <span className="visually-hidden">{label}</span>}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="gw-skeleton__row" aria-hidden="true">
          <span className="gw-skeleton__bar gw-skeleton__bar--check" />
          <span className="gw-skeleton__bar" style={{ width: WIDTHS[i % WIDTHS.length] }} />
        </div>
      ))}
    </div>
  );
}
