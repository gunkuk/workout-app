import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useProgramStore } from "../store/programStore";
import { listPrograms } from "../store/queries";
import { parseAndValidateProgram, fetchProgramFromUrl } from "../lib/programImport";
import { listBundledPrograms } from "../lib/bundledPrograms";
import { validateAnchor } from "../domain/cyclePos";
import type { ProgramDefinition, ProgramInstanceState } from "../domain/types.ts";

/**
 * Stage1-C3 T2 — 프로그램 라이브러리: 목록·전환·가져오기(파일/URL).
 * 전환 확인은 window.confirm(간단 다이얼로그) — 별도 모달 컴포넌트 없이도 "정말 전환할지"
 * 되묻는 요구(계획 문서)를 충족하는 최소 구현. 같은 프로그램으로 재전환도 새 InstanceState를
 * 만든다(스펙 §2-7) — no-op 처리하지 않는다.
 *
 * 항목2b — "프로그램 라이브러리"(사용자가 추가한 것)와 "내장 프로그램"(아직 안 추가한 것)의
 * 구분을 없앴다(사용자 피드백: "내장프로그램이랑 뭐가 다른 거야? 그냥 자동 내장 시켜"). 내장
 * 프로그램은 항상 이미 라이브러리에 있는 것처럼 하나의 목록에 함께 보이고, "추가" 개념 자체가
 * 없다 — 아직 실제로 import되지 않은 내장 항목을 전환하면 handleSwitch가 즉시 import한다.
 */
export function ProgramLibrary() {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const switchProgram = useProgramStore((s) => s.switchProgram);
  const importProgram = useProgramStore((s) => s.importProgram);

  const instanceState = useProgramStore((s) => s.instanceState);

  const [programs, setPrograms] = useState<ProgramDefinition[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [urlValue, setUrlValue] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 내장 프로그램 목록 — 검증 결과는 요청마다 바뀌지 않으므로 1회만 계산.
  const [bundledPrograms] = useState(() => listBundledPrograms());

  // 모드 설정(Stage1-C3 T3) — 현재 활성 프로그램의 rolling↔calendar 전환.
  const [modeSelection, setModeSelection] = useState<"rolling" | "calendar">("rolling");
  const [startDateInput, setStartDateInput] = useState("");
  const [modeError, setModeError] = useState<string | null>(null);

  async function refresh() {
    setPrograms(await listPrograms());
  }

  useEffect(() => {
    void refresh();
  }, [activeProgram]);

  // 항목2b — listPrograms()(사용자가 실제로 import한 것)와 내장 카탈로그를 id 기준으로 병합.
  // 내장 프로그램이 아직 import 안 됐어도 항상 목록에 나타난다(bp.load()로 정의를 가져와 채움).
  // 이미 라이브러리에 있으면 그 실제 엔트리를 우선한다(버전 등 실제 상태 반영).
  const displayPrograms = useMemo(() => {
    const byId = new Map<string, ProgramDefinition>();
    for (const bp of bundledPrograms) byId.set(bp.id, bp.load());
    for (const p of programs) byId.set(p.id, p);
    return [...byId.values()];
  }, [bundledPrograms, programs]);

  async function handleImportResult(text: string) {
    const result = parseAndValidateProgram(text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    await importProgram(result.program);
    await refresh();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      await handleImportResult(text);
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlImport() {
    if (!urlValue.trim()) return;
    setBusy(true);
    try {
      const text = await fetchProgramFromUrl(urlValue.trim());
      await handleImportResult(text);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch(program: ProgramDefinition) {
    if (!window.confirm(`"${program.name}"(으)로 전환할까요?`)) return;
    setBusy(true);
    try {
      // 아직 실제로 import 안 된 내장 프로그램(라이브러리 테이블엔 없음)이면 전환 전에 먼저 import.
      const alreadyImported = programs.some((p) => p.id === program.id && p.version === program.version);
      if (!alreadyImported) {
        await importProgram(program);
        await refresh();
      }
      await switchProgram({
        programId: program.id,
        programVersion: program.version,
        mode: "rolling",
        anchor: {},
        schemaVersion: 1,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleModeApply() {
    if (!activeProgram) return;
    setModeError(null);

    if (modeSelection === "rolling") {
      await switchProgram({
        programId: activeProgram.id,
        programVersion: activeProgram.version,
        mode: "rolling",
        anchor: {},
        schemaVersion: 1,
      });
      return;
    }

    const candidate: ProgramInstanceState = {
      programId: activeProgram.id,
      programVersion: activeProgram.version,
      mode: "calendar",
      anchor: { startDate: startDateInput },
      schemaVersion: 1,
    };
    if (!validateAnchor(activeProgram, candidate)) {
      setModeError("시작일은 프로그램 첫 훈련 요일이어야 합니다");
      return;
    }
    await switchProgram(candidate);
  }

  return (
    <section className="settings-card">
      <h3>프로그램 라이브러리</h3>
      {errors.length > 0 && (
        <div role="alert" className="alert">
          <ul>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      <ul data-testid="program-library-list">
        {displayPrograms.map((program) => {
          const isActive = activeProgram?.id === program.id && activeProgram?.version === program.version;
          return (
            <li
              key={program.id}
              data-testid={`program-item-${program.id}`}
              className={`program-item${isActive ? " program-item-active" : ""}`}
            >
              <span className="program-item-name">
                {program.name} (v{program.version})
              </span>
              {isActive ? (
                <span className="program-item-badge" data-testid={`program-active-badge-${program.id}`}>
                  ✓ 활성
                </span>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => handleSwitch(program)} disabled={busy}>
                  이 프로그램으로 전환
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="form-field">
        <label className="form-label">
          파일에서 가져오기
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            data-testid="program-import-file-input"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>
      </div>
      {activeProgram && (
        <section>
          <h3>모드 설정</h3>
          <p>현재 모드: {instanceState?.mode === "calendar" ? "calendar" : "rolling"}</p>
          {modeError && <div role="alert" className="alert">{modeError}</div>}
          <label>
            <input
              type="radio"
              name="program-mode"
              value="rolling"
              checked={modeSelection === "rolling"}
              onChange={() => setModeSelection("rolling")}
            />
            rolling
          </label>
          <p className="mode-explain">
            완료한 세션 기준으로 다음 훈련일이 정해집니다 — 며칠 쉬어도 상관없이 마지막으로 한
            데서 이어갑니다. 요일 고정 없이 자유롭게 진행하고 싶을 때 씁니다.
          </p>
          <label>
            <input
              type="radio"
              name="program-mode"
              value="calendar"
              checked={modeSelection === "calendar"}
              onChange={() => setModeSelection("calendar")}
            />
            calendar
          </label>
          <p className="mode-explain">
            실제 달력 요일에 프로그램을 고정 배치합니다 — 예정된 요일에 안 하면 그날은 그냥
            넘어갑니다(밀리지 않음). 특정 요일마다 정해진 운동을 하고 싶을 때 씁니다.
          </p>
          {modeSelection === "calendar" && (
            <label className="form-label">
              시작일
              <input
                type="text"
                placeholder="YYYY-MM-DD"
                className="form-input"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
              />
            </label>
          )}
          <button type="button" className="btn btn-primary" onClick={handleModeApply}>
            모드 적용
          </button>
        </section>
      )}
      <div className="form-field">
        <label className="form-label">
          URL에서 가져오기
          <input
            type="text"
            className="form-input"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="button" className="btn btn-secondary" onClick={handleUrlImport} disabled={busy}>
          URL로 가져오기
        </button>
      </div>
    </section>
  );
}
