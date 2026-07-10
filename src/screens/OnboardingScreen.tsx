import { useMemo, useState, type FormEvent } from "react";
import { upsertProgramVersion, addToLibrary, setInstanceState, appendDecision } from "../storage/eventStore";
import { useProgramStore } from "../store/programStore";
import type { DecisionEvent, DecisionTarget, ProgramDefinition } from "../domain/types.ts";
// JSON import 방식: tsconfig에 resolveJsonModule이 없어(이 태스크는 tsconfig 수정 범위 밖) 네이티브
// `import seed from "...json"`은 typecheck 실패. Vite의 `?raw` 쿼리(문자열 import, vite/client.d.ts에
// 이미 타입 선언됨)로 받아 JSON.parse — 신규 devDep·tsconfig 변경 없이 해결.
import seedRaw from "../../programs/nsuns-5day.json?raw";

export type OnboardingScreenProps = {
  /** 시드·최초 인스턴스 생성 완료 후 호출 — 라우팅은 호출부(Task 7의 App) 책임 */
  onComplete?: () => void;
};

type ExerciseInput = { id: string; label: string; placeholder?: number };

/** T1(바벨 4종) — 스펙 §2-8: 데드는 "보수적으로 초기화", 고정 placeholder 없음(사용자 직접 입력 강제, 기본값 제시 안 함) */
const T1_EXERCISES: ExerciseInput[] = [
  { id: "bench", label: "벤치프레스 (T1)", placeholder: 105 },
  { id: "ohp", label: "OHP (T1)", placeholder: 67.5 },
  { id: "squat", label: "스쿼트 (T1)", placeholder: 85 },
  { id: "deadlift", label: "데드리프트 (T1) — 보수적으로 시작하세요" },
];

/** T2 독립 리프트 4종 — 악세사리(tracked)는 여기서 시드하지 않는다(설계상 의도, needsInit으로 TodayScreen에서 자체 부트스트랩) */
const T2_EXERCISES: ExerciseInput[] = [
  { id: "sumoDeadlift", label: "스모 데드리프트 (T2)" },
  { id: "frontSquat", label: "프론트 스쿼트 (T2)" },
  { id: "inclineBench", label: "인클라인 벤치프레스 (T2)" },
  { id: "cgbp", label: "클로즈그립 벤치프레스 (T2)" },
];

const ALL_EXERCISES = [...T1_EXERCISES, ...T2_EXERCISES];

function nowISO(): string {
  return new Date().toISOString();
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return ua.includes("iPhone") || ua.includes("iPad");
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const load = useProgramStore((s) => s.load);

  // 마운트 시 1회 판정 — display-mode는 세션 중 안 바뀐다고 가정(변경 시 새로고침으로 재판정, MVP 범위).
  const showBanner = useMemo(() => !isStandalone(), []);

  function handleChange(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed: Record<string, number> = {};
    for (const ex of ALL_EXERCISES) {
      const raw = (values[ex.id] ?? "").trim();
      const num = Number(raw);
      if (raw === "" || !Number.isFinite(num)) {
        setError("모든 TM 항목에 숫자를 입력해주세요.");
        return;
      }
      parsed[ex.id] = num;
    }

    setSubmitting(true);
    try {
      const seedProgram = JSON.parse(seedRaw) as ProgramDefinition;
      const at = nowISO();
      await upsertProgramVersion(seedProgram);
      await addToLibrary(seedProgram.id, at);
      await setInstanceState({
        programId: seedProgram.id,
        programVersion: seedProgram.version,
        mode: "rolling",
        anchor: {},
        schemaVersion: 1,
      });
      for (const ex of ALL_EXERCISES) {
        const target: DecisionTarget = { kind: "tm", exerciseId: ex.id };
        const decision: DecisionEvent = {
          id: crypto.randomUUID(),
          target,
          kind: "seed",
          value: parsed[ex.id]!,
          at,
          schemaVersion: 1,
        };
        await appendDecision(decision);
      }
      await load();
      onComplete?.();
    } catch {
      setError("저장 실패 — 다시 시도해주세요.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <div>
      {showBanner && (
        <div role="status" data-testid="install-banner">
          {isIOS()
            ? "설치: 공유 버튼 → 홈 화면에 추가"
            : "설치: 브라우저 메뉴에서 '홈 화면에 추가'를 선택하세요"}
        </div>
      )}
      <h2>온보딩 — 트레이닝 맥스(TM) 설정</h2>
      {error && <div role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        {ALL_EXERCISES.map((ex) => (
          <div key={ex.id}>
            <label htmlFor={`tm-${ex.id}`}>{ex.label}</label>
            <input
              id={`tm-${ex.id}`}
              data-testid={`tm-input-${ex.id}`}
              type="number"
              step="0.5"
              placeholder={ex.placeholder !== undefined ? String(ex.placeholder) : undefined}
              value={values[ex.id] ?? ""}
              onChange={(e) => handleChange(ex.id, e.target.value)}
            />
          </div>
        ))}
        <button type="submit" disabled={submitting}>
          시작하기
        </button>
      </form>
    </div>
  );
}
