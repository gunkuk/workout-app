import { useState } from "react";
import { useProgramStore } from "../store/programStore";
import { nowISO } from "../lib/time";
import type { MuscleGroup } from "../domain/exerciseLibrary";
import type { FreeExercise, CardioEntry } from "../store/queries";

const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "가슴",
  back: "등",
  shoulders: "어깨",
  quads: "대퇴사두",
  hamstrings: "햄스트링",
  glutes: "둔근",
  calves: "종아리",
  biceps: "이두",
  triceps: "삼두",
  core: "코어",
};

type ExerciseRow = { name: string; weightKg: string; reps: string; sets: string };
type CardioRow = { kind: string; minutes: string; distanceKm: string };

function emptyExerciseRow(): ExerciseRow {
  return { name: "", weightKg: "", reps: "", sets: "" };
}

function emptyCardioRow(): CardioRow {
  return { kind: "", minutes: "", distanceKm: "" };
}

function toNumberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 크로스핏 · 자유 운동 기록 화면(Stage1-UI6) — nSuns 프로그램 밖의 자유 운동/유산소를
 * ExternalSessionRecord(storage/db.ts)로 저장한다. 저장 위치(cyclePos)는 AnalyticsScreen의
 * "외부 세션 추가" 계약과 동일하게 todayPos 우선, 없으면 {cycleIndex:0, week:0} 폴백(§요구사항
 * 명시 edge case — todayPos가 아직 없는 온보딩 직후 등 드문 경로).
 */
export function FreeWorkoutScreen({ onDone }: { onDone: () => void }) {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const todayPos = useProgramStore((s) => s.todayPos);
  const recordExternalSession = useProgramStore((s) => s.recordExternalSession);

  const [label, setLabel] = useState("크로스핏");
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>([emptyExerciseRow()]);
  const [cardioRows, setCardioRows] = useState<CardioRow[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<MuscleGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!activeProgram) {
    return (
      <div>
        <p>먼저 프로그램을 시작하세요</p>
        <a href="#/home" className="back-link">
          ← 홈으로
        </a>
      </div>
    );
  }

  function toggleGroup(g: MuscleGroup) {
    setSelectedGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function updateExerciseRow(index: number, patch: Partial<ExerciseRow>) {
    setExerciseRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateCardioRow(index: number, patch: Partial<CardioRow>) {
    setCardioRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSave() {
    setBusy(true);
    try {
      // cyclePos 폴백 계약: todayPos 없으면 {cycleIndex:0, week:0}(드문 edge case).
      const cyclePos = todayPos ? { cycleIndex: todayPos.cycleIndex, week: todayPos.week } : { cycleIndex: 0, week: 0 };

      const exercises: FreeExercise[] = exerciseRows
        .filter((r) => r.name.trim() !== "")
        .map((r) => ({
          name: r.name.trim(),
          weightKg: toNumberOrUndefined(r.weightKg),
          reps: toNumberOrUndefined(r.reps),
          sets: toNumberOrUndefined(r.sets),
        }));

      const cardio: CardioEntry[] = cardioRows
        .filter((r) => r.kind.trim() !== "")
        .map((r) => ({
          kind: r.kind.trim(),
          minutes: toNumberOrUndefined(r.minutes),
          distanceKm: toNumberOrUndefined(r.distanceKm),
        }));

      await recordExternalSession({
        id: crypto.randomUUID(),
        at: nowISO(),
        groups: selectedGroups,
        programId: activeProgram!.id,
        cyclePos,
        label,
        exercises,
        cardio,
      });

      setStatus("기록 완료");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <a href="#/home" className="back-link">
        ← 홈으로
      </a>
      <h1 className="screen-title">크로스핏 · 자유 운동</h1>
      {status && (
        <div role="status" className="status-banner">
          {status}
        </div>
      )}

      <section className="settings-card">
        <label className="form-label">
          종류
          <input
            type="text"
            className="form-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      </section>

      <section className="settings-card">
        <h3 className="slot-eyebrow">자유 운동</h3>
        {exerciseRows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="운동명"
              aria-label="운동명"
              value={row.name}
              onChange={(e) => updateExerciseRow(i, { name: e.target.value })}
            />
            <input
              type="number"
              className="form-input"
              placeholder="무게(kg)"
              aria-label="무게(kg)"
              value={row.weightKg}
              onChange={(e) => updateExerciseRow(i, { weightKg: e.target.value })}
            />
            <input
              type="number"
              className="form-input"
              placeholder="횟수"
              aria-label="횟수"
              value={row.reps}
              onChange={(e) => updateExerciseRow(i, { reps: e.target.value })}
            />
            <input
              type="number"
              className="form-input"
              placeholder="세트"
              aria-label="세트"
              value={row.sets}
              onChange={(e) => updateExerciseRow(i, { sets: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setExerciseRows((prev) => prev.filter((_, idx) => idx !== i))}
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setExerciseRows((prev) => [...prev, emptyExerciseRow()])}
        >
          + 운동 추가
        </button>
      </section>

      <section className="settings-card">
        <h3 className="slot-eyebrow">유산소</h3>
        {cardioRows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="러닝 / 로잉 / 에어바이크"
              aria-label="종류"
              value={row.kind}
              onChange={(e) => updateCardioRow(i, { kind: e.target.value })}
            />
            <input
              type="number"
              className="form-input"
              placeholder="시간(분)"
              aria-label="시간(분)"
              value={row.minutes}
              onChange={(e) => updateCardioRow(i, { minutes: e.target.value })}
            />
            <input
              type="number"
              className="form-input"
              placeholder="거리(km)"
              aria-label="거리(km)"
              value={row.distanceKm}
              onChange={(e) => updateCardioRow(i, { distanceKm: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCardioRows((prev) => prev.filter((_, idx) => idx !== i))}
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCardioRows((prev) => [...prev, emptyCardioRow()])}
        >
          + 유산소 추가
        </button>
      </section>

      <section className="settings-card">
        <h3 className="slot-eyebrow">부위 태그 (선택)</h3>
        {(Object.entries(GROUP_LABELS) as [MuscleGroup, string][]).map(([group, groupLabel]) => (
          <label key={group} className={`group-chip${selectedGroups.includes(group) ? " is-checked" : ""}`}>
            <input
              type="checkbox"
              data-testid={`free-group-${group}`}
              checked={selectedGroups.includes(group)}
              onChange={() => toggleGroup(group)}
            />
            {groupLabel}
          </label>
        ))}
      </section>

      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
        기록 저장
      </button>
    </div>
  );
}
