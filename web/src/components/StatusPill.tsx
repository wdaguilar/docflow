import { ClockIcon } from "./Icons";

const LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_others: "Waiting for Others",
  completed: "Signed",
  voided: "Voided",
};

export function StatusPill({ status }: { status: string }) {
  const cls =
    status === "draft" ? "draft" : status === "voided" ? "voided" : "done";
  return (
    <span className={`pill ${cls}`}>
      {LABEL[status] ?? status}
      {status === "completed" && <span className="tick">✓</span>}
      {status === "awaiting_others" && (
        <span className="clock">
          <ClockIcon size={13} />
        </span>
      )}
    </span>
  );
}
