import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";

interface SortableHeaderProps {
  label: string;
  /** null when the table is sorted by another column. */
  direction: "ascending" | "descending" | null;
  onSort: () => void;
  disabled?: boolean;
  className?: string;
}

/** A column header whose button sorts the table; aria-sort on the header carries the state. */
export default function SortableHeader({ label, direction, onSort, disabled, className }: SortableHeaderProps) {
  const Icon = direction === "ascending" ? LuArrowUp : direction === "descending" ? LuArrowDown : LuArrowUpDown;
  return (
    <th scope="col" className={className ? `header-cell ${className}` : "header-cell"} aria-sort={direction ?? "none"}>
      <button type="button" className="gw-sort-button" onClick={onSort} disabled={disabled}>
        {label}
        <Icon size={14} aria-hidden="true" />
      </button>
    </th>
  );
}
