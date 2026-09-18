import type { ClipboardEvent, KeyboardEvent } from "react";
import { useRef } from "react";

const LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
  labelId: string;
  loading?: boolean;
  invalid?: boolean;
  describedById?: string;
}

export default function OtpInput({
  value,
  onChange,
  idPrefix,
  labelId,
  loading,
  invalid,
  describedById,
}: OtpInputProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  const focusAt = (index: number) => {
    boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();
  };

  const commit = (next: string[]) => onChange(next.join("").slice(0, LENGTH));

  const fillFrom = (index: number, text: string) => {
    const next = [...digits];
    for (let i = 0; i < text.length && index + i < LENGTH; i += 1) {
      next[index + i] = text[i];
    }
    commit(next);
    focusAt(index + text.length);
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");

    if (!cleaned) {
      const next = [...digits];
      next[index] = "";
      commit(next);
      return;
    }

    // A password manager or OS autofill drops the whole code into one box.
    if (cleaned.length > 1) {
      fillFrom(index, cleaned);
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    commit(next);
    focusAt(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index]) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      commit(next);
      focusAt(index - 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    event.preventDefault();
    fillFrom(index, text);
  };

  return (
    <div
      className="otp-input"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedById}
    >
      {digits.map((digit, index) => (
        <input
          key={`${idPrefix}-${index}`}
          ref={(el) => {
            boxes.current[index] = el;
          }}
          id={index === 0 ? idPrefix : undefined}
          className="otp-input__box"
          type="text"
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          disabled={loading}
          inputMode="numeric"
          maxLength={LENGTH}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
        />
      ))}
    </div>
  );
}
