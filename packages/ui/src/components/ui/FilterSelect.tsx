interface FilterSelectProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A labelled dropdown in a .gw-filters row above a table. */
export default function FilterSelect<T extends string>({ id, label, value, options, onChange }: FilterSelectProps<T>) {
  return (
    <div className="gw-filter">
      <label htmlFor={id} className="gw-filter__label">
        {label}
      </label>
      <select id={id} className="gw-input gw-filter__select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
