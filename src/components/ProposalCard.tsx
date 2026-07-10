import { useState } from "react";
import { useProgramStore } from "../store/programStore";
import { appendDecision } from "../storage/eventStore";
import { nowISO } from "../lib/time";
import type { Proposal, DecisionEvent } from "../domain/types.ts";

export type ProposalCardProps = {
  proposal: Proposal;
};

/** Proposal.type -> DecisionEvent.kind 전수 매핑 (fold.ts가 만드는 4가지 제안 타입과 1:1, plan 계약) */
function kindFor(type: Proposal["type"]): DecisionEvent["kind"] {
  switch (type) {
    case "tmDeload":
      return "deloadAccepted";
    case "tmBonus":
      return "bonusAccepted";
    case "t2Deload":
      return "t2DeloadAccepted";
    case "accessoryRollback":
      return "rollbackAccepted";
  }
}

/**
 * 제안(Proposal) 1건 승인 카드. 옵션 선택 시 DecisionEvent를 만들어 append하고 스토어를 재조회한다
 * (fold의 proposals.delete(key)가 이 결정으로 해당 target의 제안을 소비 — 다음 재조회에서 카드가 사라짐).
 * "동결/보류"는 아무 것도 쓰지 않는 무동작 버튼 — 클릭하지 않고 두어도 동일하게 카드가 계속 보류 상태로 남는다.
 */
export function ProposalCard({ proposal }: ProposalCardProps) {
  const refreshAfterWrite = useProgramStore((s) => s.refreshAfterWrite);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(value: number) {
    setError(null);
    const decision: DecisionEvent = {
      id: crypto.randomUUID(),
      target: proposal.target,
      kind: kindFor(proposal.type),
      value,
      sourceSetRecordId: proposal.sourceSetRecordId,
      at: nowISO(),
      schemaVersion: 1,
    };
    try {
      await appendDecision(decision);
      await refreshAfterWrite();
    } catch {
      setError("저장 실패 — 다시 시도해주세요.");
    }
  }

  return (
    <div data-testid="proposal-card" style={{ border: "1px solid #ccc", padding: 8, marginBottom: 8 }}>
      <p>{proposal.label}</p>
      {error && <div role="alert">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {proposal.options.map((opt, i) => (
          <button key={i} type="button" onClick={() => handleSelect(opt)}>
            {opt}kg
          </button>
        ))}
        <button type="button" onClick={() => {}}>
          동결/보류
        </button>
      </div>
    </div>
  );
}
