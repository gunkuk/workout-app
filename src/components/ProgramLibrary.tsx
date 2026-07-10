import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useProgramStore } from "../store/programStore";
import { listPrograms } from "../store/queries";
import { parseAndValidateProgram, fetchProgramFromUrl } from "../lib/programImport";
import { validateAnchor } from "../domain/cyclePos";
import type { ProgramDefinition, ProgramInstanceState } from "../domain/types.ts";

/**
 * Stage1-C3 T2 — 프로그램 라이브러리: 목록·전환·가져오기(파일/URL).
 * 전환 확인은 window.confirm(간단 다이얼로그) — 별도 모달 컴포넌트 없이도 "정말 전환할지"
 * 되묻는 요구(계획 문서)를 충족하는 최소 구현. 같은 프로그램으로 재전환도 새 InstanceState를
 * 만든다(스펙 §2-7) — no-op 처리하지 않는다.
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
    await switchProgram({
      programId: program.id,
      programVersion: program.version,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    });
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
      <ul>
        {programs.map((program) => {
          const isActive = activeProgram?.id === program.id && activeProgram?.version === program.version;
          return (
            <li key={program.id}>
              {program.name} (v{program.version}) {isActive && <strong>활성</strong>}
              {!isActive && (
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
