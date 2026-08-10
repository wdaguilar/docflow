/**
 * The signing state machine, kept pure so it can be tested without a database.
 *
 * Signers hold an `order` index. In sequential mode only the lowest unsigned
 * order is `active`; everyone behind them is `pending`. In parallel mode every
 * unsigned signer is active at once.
 */

export type SignerStatus = "pending" | "active" | "signed";
export type DocumentStatus =
  | "draft"
  | "awaiting_others"
  | "completed"
  | "voided";

export interface Signer {
  id: string;
  order: number;
  status: SignerStatus;
}

export type Mode = "sequential" | "parallel";

export class WorkflowError extends Error {}

function byOrder(a: Signer, b: Signer) {
  return a.order - b.order;
}

/**
 * Recompute every signer's status from scratch. Idempotent by design — calling
 * it twice on the same input gives the same output, so a retried request or a
 * replayed webhook can never skip a signer forward.
 */
export function reconcile(signers: Signer[], mode: Mode): Signer[] {
  const sorted = [...signers].sort(byOrder);
  const firstUnsigned = sorted.find((s) => s.status !== "signed");
  return sorted.map((s) => {
    if (s.status === "signed") return s;
    if (mode === "parallel") return { ...s, status: "active" as const };
    return {
      ...s,
      status: s.id === firstUnsigned?.id ? ("active" as const) : ("pending" as const),
    };
  });
}

export interface SignResult {
  signers: Signer[];
  documentStatus: DocumentStatus;
  /** Signers who became active as a result of this signature. */
  activated: Signer[];
  /** True on the signature that completes the document. */
  completed: boolean;
}

export function applySignature(
  signers: Signer[],
  signerId: string,
  mode: Mode,
): SignResult {
  const target = signers.find((s) => s.id === signerId);
  if (!target) throw new WorkflowError("signer not found");
  if (target.status === "signed") throw new WorkflowError("already signed");
  if (target.status === "pending") throw new WorkflowError("not this signer's turn");

  const before = reconcile(signers, mode);
  const marked = before.map((s) =>
    s.id === signerId ? { ...s, status: "signed" as const } : s,
  );
  const after = reconcile(marked, mode);

  const wasActive = new Set(
    before.filter((s) => s.status === "active").map((s) => s.id),
  );
  const activated = after.filter(
    (s) => s.status === "active" && !wasActive.has(s.id),
  );
  const completed = after.every((s) => s.status === "signed");

  return {
    signers: after,
    documentStatus: completed ? "completed" : "awaiting_others",
    activated,
    completed,
  };
}

export function progress(signers: Signer[]): { signed: number; total: number } {
  return {
    signed: signers.filter((s) => s.status === "signed").length,
    total: signers.length,
  };
}
