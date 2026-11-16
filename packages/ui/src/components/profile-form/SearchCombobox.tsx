import React, { useEffect, useId, useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuX } from "react-icons/lu";

// Editable comboboxes with a list popup, after the WAI-ARIA APG "list autocomplete" pattern: focus
// stays in the text box, arrow keys move aria-activedescendant, Enter picks, Escape closes. The
// list sits in the page flow rather than floating, so a dialog's overflow can't clip it.

interface Common {
  id: string;
  options: string[];
  /** Names the list for screen readers, e.g. "State entities". */
  listLabel: string;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
}

function filter(options: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
}

function countText(n: number): string {
  return n === 0 ? "No matches." : `${n} ${n === 1 ? "result" : "results"} available.`;
}

function useListKeys(list: string[], onPick: (option: string) => void) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, onEscapeClosed: () => void) => {
    const last = list.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => (list.length === 0 ? -1 : !open || i >= last ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => (list.length === 0 ? -1 : !open || i <= 0 ? last : i - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && active <= last) {
        e.preventDefault();
        onPick(list[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else onEscapeClosed();
    } else if (e.key === "Tab") {
      close();
    }
  };
  return { open, setOpen, active, setActive, close, onKeyDown };
}

function useScrollActive(id: string, active: number) {
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, active]);
}

function OptionList({
  id,
  list,
  active,
  isSelected,
  onPick,
  label,
  multi,
}: {
  id: string;
  list: string[];
  active: number;
  isSelected: (o: string) => boolean;
  onPick: (o: string) => void;
  label: string;
  multi?: boolean;
}) {
  return (
    <>
      <div id={`${id}-list`} className="gw-combobox__list" role="listbox" aria-label={label} aria-multiselectable={multi || undefined}>
        {list.map((o, i) => (
          // Keys arrive through the text box (aria-activedescendant), as the APG pattern has it.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <div
            key={o}
            id={`${id}-opt-${i}`}
            role="option"
            tabIndex={-1}
            aria-selected={multi ? isSelected(o) : i === active}
            className={`gw-combobox__option${i === active ? " gw-combobox__option--active" : ""}${isSelected(o) ? " gw-combobox__option--selected" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
          >
            <span className="gw-combobox__check" aria-hidden="true">
              {isSelected(o) && <LuCheck size={16} />}
            </span>
            {o}
          </div>
        ))}
      </div>
      {list.length === 0 && <p className="gw-combobox__empty">No matches</p>}
    </>
  );
}

/** One choice from a long list. `value` is empty until the user picks a listed option. */
export function SearchSelect({ id, options, value, onChange, listLabel, placeholder, describedBy, invalid, required }: Common & {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const list = editing ? filter(options, query) : options;
  const pick = (o: string) => {
    onChange(o);
    setEditing(false);
    setQuery("");
    keys.close();
  };
  const keys = useListKeys(list, pick);
  useScrollActive(id, keys.active);

  useEffect(() => {
    if (value) setEditing(false);
  }, [value]);

  return (
    <div className="gw-combobox">
      <div className="gw-combobox__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="gw-input gw-combobox__input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={keys.open}
          aria-controls={`${id}-list`}
          aria-activedescendant={keys.open && keys.active >= 0 ? `${id}-opt-${keys.active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={editing ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setEditing(true);
            keys.setOpen(true);
            keys.setActive(-1);
            if (value) onChange("");
          }}
          onKeyDown={(e) =>
            keys.onKeyDown(e, () => {
              setEditing(false);
              setQuery("");
            })
          }
          onBlur={() => {
            keys.close();
            if (!editing) return;
            const exact = options.find((o) => o.toLowerCase() === query.trim().toLowerCase());
            if (exact) pick(exact);
          }}
        />
        <button
          type="button"
          className="gw-combobox__toggle"
          tabIndex={-1}
          aria-label={`Show ${listLabel.toLowerCase()}`}
          aria-expanded={keys.open}
          aria-controls={`${id}-list`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (keys.open) keys.close();
            else keys.setOpen(true);
          }}
        >
          <LuChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      {keys.open && <OptionList id={id} list={list} active={keys.active} isSelected={(o) => o === value} onPick={pick} label={listLabel} />}
      <div className="visually-hidden" role="status" aria-live="polite">
        {keys.open ? countText(list.length) : ""}
      </div>
    </div>
  );
}

/** Several choices from a long list, shown as removable chips. `onToggle` returns what to announce. */
export function SearchMultiSelect({ id, options, selected, onToggle, listLabel, chipsLabel, placeholder, describedBy, invalid, required }: Common & {
  selected: string[];
  onToggle: (option: string) => string;
  /** Names the chip list, e.g. "Selected counties". */
  chipsLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const list = filter(options, query);
  const toggle = (o: string) => {
    setMessage(onToggle(o));
    setQuery("");
    keys.setActive(-1);
  };
  const keys = useListKeys(list, toggle);
  useScrollActive(id, keys.active);
  const statusId = useId();

  const removeChip = (o: string, index: number) => {
    setMessage(onToggle(o));
    // Focus the chip that slides into this one's place, else the one before, else the text box.
    requestAnimationFrame(() => {
      const buttons: HTMLButtonElement[] = Array.from(chipsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      (buttons[index] ?? buttons[index - 1] ?? inputRef.current)?.focus();
    });
  };

  return (
    <div className="gw-combobox">
      {selected.length > 0 && (
        <ul ref={chipsRef} className="gw-chips" aria-label={chipsLabel}>
          {selected.map((o, i) => (
            <li key={o} className="gw-chip">
              {o}
              <button type="button" className="gw-chip__remove" aria-label={`Remove ${o}`} onClick={() => removeChip(o, i)}>
                <LuX size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="gw-combobox__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="gw-input gw-combobox__input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={keys.open}
          aria-controls={`${id}-list`}
          aria-activedescendant={keys.open && keys.active >= 0 ? `${id}-opt-${keys.active}` : undefined}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(" ")}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            keys.setOpen(true);
            keys.setActive(-1);
          }}
          onKeyDown={(e) => keys.onKeyDown(e, () => setQuery(""))}
          onBlur={keys.close}
        />
        <button
          type="button"
          className="gw-combobox__toggle"
          tabIndex={-1}
          aria-label={`Show ${listLabel.toLowerCase()}`}
          aria-expanded={keys.open}
          aria-controls={`${id}-list`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (keys.open) keys.close();
            else keys.setOpen(true);
          }}
        >
          <LuChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      {keys.open && (
        <OptionList id={id} list={list} active={keys.active} isSelected={(o) => selected.includes(o)} onPick={toggle} label={listLabel} multi />
      )}
      <p id={statusId} className="visually-hidden">
        {selected.length ? `Selected: ${selected.join(", ")}.` : "None selected."}
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {[message, keys.open ? countText(list.length) : ""].filter(Boolean).join(" ")}
      </div>
    </div>
  );
}
