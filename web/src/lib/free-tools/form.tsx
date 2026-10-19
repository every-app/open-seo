import {
  createContext,
  useContext,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { TOOL_COUNTRIES } from "@/lib/free-tools/countries";
import { useTurnstile } from "@/lib/free-tools/turnstile";

const SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ||
  (import.meta.env.DEV ? "1x00000000000000000000AA" : "");
type VerificationStatus = "loading" | "ready" | "error";
const VerificationContext = createContext<VerificationStatus>("loading");

export type ToolStatus = "idle" | "loading" | "done" | "error";

export const FIELD_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3.5 text-base text-neutral-900 placeholder:text-neutral-500 transition focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium text-[var(--color-brand-muted)]"
    >
      {children}
    </label>
  );
}

export function CountrySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (code: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      name="country"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={FIELD_CLASS}
    >
      {TOOL_COUNTRIES.map((country) => (
        <option key={country.code} value={country.code}>
          {country.label}
        </option>
      ))}
    </select>
  );
}

export function SubmitButton({
  status,
  idleLabel,
  loadingLabel = "Checking…",
}: {
  status: ToolStatus;
  idleLabel: string;
  loadingLabel?: string;
}) {
  const verificationStatus = useContext(VerificationContext);
  return (
    <button
      type="submit"
      disabled={status === "loading" || verificationStatus !== "ready"}
      className="h-11 shrink-0 rounded-lg bg-neutral-950 px-6 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
    >
      {status === "loading"
        ? loadingLabel
        : verificationStatus === "loading"
          ? "Verifying…"
          : idleLabel}
    </button>
  );
}

/**
 * Every API-backed tool submits through this form. It owns verification and
 * supplies button readiness through context so individual tools cannot drift.
 */
export function ToolForm({
  onSubmit,
  input,
  status,
  errorMessage,
  cacheDuration = "24 hours",
  notes = true,
  children,
}: {
  onSubmit: (input: Record<string, unknown>, token: string) => Promise<void>;
  input: Record<string, unknown>;
  status: ToolStatus;
  errorMessage: string;
  cacheDuration?: string;
  /** The small print under the form. Errors always show. */
  notes?: boolean;
  children: ReactNode;
}) {
  const token = useRef("");
  const submitting = useRef(false);
  const [verification, setVerification] = useState<VerificationStatus>(
    SITE_KEY ? "loading" : "error",
  );
  const updateToken = (value = "") => {
    token.current = value;
    setVerification(value ? "ready" : "loading");
  };
  const fail = () => {
    token.current = "";
    setVerification("error");
  };
  const widget = useTurnstile(SITE_KEY, updateToken, fail);
  const retry = () => {
    if (!SITE_KEY) return;
    updateToken();
    widget.reset();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !token.current) return;
    if (widget.isExpired()) return retry();
    const verifiedToken = token.current;
    updateToken();
    submitting.current = true;
    try {
      await onSubmit(input, verifiedToken);
    } finally {
      submitting.current = false;
      updateToken();
      widget.reset();
    }
  };
  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 md:p-5"
    >
      <VerificationContext.Provider value={verification}>
        {children}
      </VerificationContext.Provider>
      {SITE_KEY ? <div ref={widget.container} /> : null}
      {notes ? (
        <p className="mt-2.5 text-xs text-[var(--color-brand-muted)]">
          Free &middot; No signup
        </p>
      ) : null}
      {notes && verification === "loading" && status !== "loading" ? (
        <p
          role="status"
          className="mt-2 text-xs text-[var(--color-brand-muted)]"
        >
          Verifying your browser. Complete the check above if prompted.
        </p>
      ) : null}
      {verification === "error" ? (
        <div role="alert" className="mt-2 text-sm text-red-600">
          <p>
            Verification could not complete. Check your connection and try
            again.
          </p>
          <button type="button" onClick={retry} className="mt-1 underline">
            Retry verification
          </button>
        </div>
      ) : null}
      {status === "error" && errorMessage ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}
      {notes && status === "done" ? (
        <p
          role="status"
          className="mt-2 text-xs text-[var(--color-brand-muted)]"
        >
          Results may be cached for up to {cacheDuration}.
        </p>
      ) : null}
    </form>
  );
}
