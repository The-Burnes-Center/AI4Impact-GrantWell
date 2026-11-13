import { useId, type ReactNode, type Ref } from "react";

/*
 * The phone form of a list page's table: a real list of cards, so a table's semantics never have to be
 * restyled away. Each card carries the row's checkbox, its title in a heading, the columns as a dl and
 * the row's main action.
 */

interface CardListToolbarProps {
  selectAll?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    inputRef?: Ref<HTMLInputElement>;
  };
  sort?: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
  };
}

export function CardListToolbar({ selectAll, sort }: CardListToolbarProps) {
  const sortId = useId();
  if (!selectAll && !sort) return null;
  return (
    <div className="gw-card-toolbar">
      {selectAll && (
        <label className="gw-select-all">
          <input
            ref={selectAll.inputRef}
            type="checkbox"
            checked={selectAll.checked}
            onChange={(e) => selectAll.onChange(e.target.checked)}
            aria-label={selectAll.label}
            disabled={selectAll.disabled}
          />
          <span aria-hidden="true">Select all</span>
        </label>
      )}
      {sort && (
        <div className="gw-card-toolbar__sort">
          <label htmlFor={sortId} className="gw-filter__label">
            Sort by
          </label>
          <select
            id={sortId}
            className="gw-input gw-filter__select"
            value={sort.value}
            onChange={(e) => sort.onChange(e.target.value)}
            disabled={sort.disabled}
          >
            {sort.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export interface CardFact {
  label: string;
  value: ReactNode;
}

interface CardListItemProps {
  title: ReactNode;
  headingLevel?: 2 | 3 | 4;
  select?: { checked: boolean; onChange: () => void; label: string };
  /** Tags and notices shown under the title. */
  badges?: ReactNode;
  facts: CardFact[];
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function CardListItem({ title, headingLevel = 2, select, badges, facts, actions, className, children }: CardListItemProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <li className={className ? `gw-card ${className}` : "gw-card"}>
      <div className="gw-card__head">
        {select && (
          <label className="gw-card__check">
            <input type="checkbox" checked={select.checked} onChange={select.onChange} aria-label={select.label} />
          </label>
        )}
        <Heading className="gw-card__title">{title}</Heading>
      </div>
      {badges && <div className="gw-card__badges">{badges}</div>}
      {facts.length > 0 && (
        <dl className="gw-card__facts">
          {facts.map((fact) => (
            <div key={fact.label} className="gw-card__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="gw-card__actions">{actions}</div>}
      {children}
    </li>
  );
}
