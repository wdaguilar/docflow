import { describe, expect, it } from "bun:test";
import {
  applySignature,
  reconcile,
  progress,
  WorkflowError,
  type Signer,
} from "../src/lib/workflow";

const three = (): Signer[] => [
  { id: "a", order: 0, status: "pending" },
  { id: "b", order: 1, status: "pending" },
  { id: "c", order: 2, status: "pending" },
];

const statuses = (s: Signer[]) => s.map((x) => x.status);

describe("reconcile", () => {
  it("activates only the first signer in sequential mode", () => {
    expect(statuses(reconcile(three(), "sequential"))).toEqual([
      "active",
      "pending",
      "pending",
    ]);
  });

  it("activates everyone at once in parallel mode", () => {
    expect(statuses(reconcile(three(), "parallel"))).toEqual([
      "active",
      "active",
      "active",
    ]);
  });

  it("is idempotent", () => {
    const once = reconcile(three(), "sequential");
    expect(reconcile(once, "sequential")).toEqual(once);
  });

  it("sorts by order regardless of input order", () => {
    const shuffled: Signer[] = [
      { id: "c", order: 2, status: "pending" },
      { id: "a", order: 0, status: "pending" },
      { id: "b", order: 1, status: "pending" },
    ];
    const out = reconcile(shuffled, "sequential");
    expect(out[0]!.id).toBe("a");
    expect(out[0]!.status).toBe("active");
  });
});

describe("applySignature", () => {
  it("hands the turn to the next signer", () => {
    const r = applySignature(reconcile(three(), "sequential"), "a", "sequential");
    expect(statuses(r.signers)).toEqual(["signed", "active", "pending"]);
    expect(r.activated.map((s) => s.id)).toEqual(["b"]);
    expect(r.completed).toBe(false);
    expect(r.documentStatus).toBe("awaiting_others");
  });

  it("refuses to let a pending signer jump the queue", () => {
    expect(() =>
      applySignature(reconcile(three(), "sequential"), "c", "sequential"),
    ).toThrow(WorkflowError);
  });

  it("rejects a duplicate signature", () => {
    const once = applySignature(reconcile(three(), "sequential"), "a", "sequential");
    expect(() => applySignature(once.signers, "a", "sequential")).toThrow(
      /already signed/,
    );
  });

  it("rejects an unknown signer", () => {
    expect(() => applySignature(three(), "zzz", "sequential")).toThrow(
      /not found/,
    );
  });

  it("completes only on the final signature", () => {
    let s = reconcile(three(), "sequential");
    for (const id of ["a", "b"]) {
      const r = applySignature(s, id, "sequential");
      expect(r.completed).toBe(false);
      s = r.signers;
    }
    const last = applySignature(s, "c", "sequential");
    expect(last.completed).toBe(true);
    expect(last.documentStatus).toBe("completed");
    expect(last.activated).toEqual([]);
  });

  it("activates nobody new in parallel mode", () => {
    const r = applySignature(reconcile(three(), "parallel"), "b", "parallel");
    expect(r.activated).toEqual([]);
    expect(statuses(r.signers)).toEqual(["active", "signed", "active"]);
  });

  it("completes in parallel mode regardless of signing order", () => {
    let s = reconcile(three(), "parallel");
    for (const id of ["c", "a"]) s = applySignature(s, id, "parallel").signers;
    expect(applySignature(s, "b", "parallel").completed).toBe(true);
  });

  it("handles a single signer", () => {
    const solo = reconcile([{ id: "solo", order: 0, status: "pending" }], "sequential");
    expect(applySignature(solo, "solo", "sequential").completed).toBe(true);
  });
});

describe("progress", () => {
  it("counts signed against total", () => {
    const r = applySignature(reconcile(three(), "sequential"), "a", "sequential");
    expect(progress(r.signers)).toEqual({ signed: 1, total: 3 });
  });
});
