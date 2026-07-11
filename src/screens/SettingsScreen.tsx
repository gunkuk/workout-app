import { useRef, useState, type ChangeEvent } from "react";
import { exportSnapshot, importSnapshot, shareOrDownloadSnapshot, parseSnapshotJSON } from "../lib/backup";
import { useProgramStore } from "../store/programStore";
import { nowISO } from "../lib/time";

/**
 * Task 7(C2) — 최소 설정 화면: 백업 내보내기/가져오기 버튼만(스펙 §2-8 범위, 그 외 설정 항목 없음).
 * 로직(스냅샷 조합, Web Share/다운로드 분기, JSON 파싱)은 전부 src/lib/backup.ts에 있고,
 * 이 화면은 그 함수들을 버튼/파일input에 배선하는 얇은 UI 레이어다(테스트도 backup.ts 쪽에서
 * DB·navigator mock으로 커버 — 이 화면 자체의 렌더링 테스트는 계획 범위 밖).
 *
 * Stage1-C3 T4 — TM 수동 편집 섹션 추가(스펙 §2-7). programStore.tm을 그대로 렌더하고, 저장 시
 * DecisionEvent{kind:"manual"}을 만들어 기존 `acceptProposal` mutation을 재사용한다 — 이름은
 * "제안 수락"이지만 본질은 appendDecision+refresh라 임의의 결정(수동 편집 포함)에 그대로 맞는다.
 */
export function SettingsScreen() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tm = useProgramStore((s) => s.tm);
  const acceptProposal = useProgramStore((s) => s.acceptProposal);
  const [tmEdits, setTmEdits] = useState<Record<string, string>>({});
  const [tmError, setTmError] = useState<string | null>(null);

  async function handleTmSave(exerciseId: string) {
    const raw = tmEdits[exerciseId];
    const value = raw === undefined ? NaN : Number(raw);
    if (raw === undefined || raw.trim() === "" || !Number.isFinite(value)) {
      setTmError("올바른 숫자를 입력해주세요.");
      return;
    }
    setTmError(null);
    await acceptProposal({
      id: crypto.randomUUID(),
      target: { kind: "tm", exerciseId },
      kind: "manual",
      value,
      at: nowISO(),
      schemaVersion: 1,
    });
    setTmEdits((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  async function handleExport() {
    setError(null);
    setStatus(null);
    setExporting(true);
    try {
      const snapshot = await exportSnapshot();
      await shareOrDownloadSnapshot(snapshot);
      setStatus("내보내기 완료");
    } catch {
      setError("내보내기 실패 — 다시 시도해주세요.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setStatus(null);
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = parseSnapshotJSON(text);
      await importSnapshot(data);
      setStatus("가져오기 완료 — 기존 데이터와 병합되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "가져오기 실패 — 다시 시도해주세요.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <a href="#/home" className="back-link">
        ← 홈으로 돌아가기
      </a>
      <h2 className="day-header">설정</h2>
      {error && <div role="alert" className="alert">{error}</div>}
      {status && <div role="status" className="status-banner">{status}</div>}
      <section className="settings-card">
        <h3>TM 수동 편집</h3>
        {tmError && <div role="alert" className="alert">{tmError}</div>}
        <ul>
          {Object.entries(tm).map(([exerciseId, value]) => (
            <li key={exerciseId}>
              {exerciseId}: {value}
              <input
                type="number"
                data-testid={`tm-input-${exerciseId}`}
                className="free-input"
                value={tmEdits[exerciseId] ?? ""}
                placeholder={String(value)}
                onChange={(e) =>
                  setTmEdits((prev) => ({ ...prev, [exerciseId]: e.target.value }))
                }
              />
              <button type="button" className="btn btn-secondary" onClick={() => handleTmSave(exerciseId)}>
                저장
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-card">
        <h3>백업</h3>
        <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          내보내기
        </button>
        <label className="form-label">
          가져오기
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            data-testid="import-file-input"
            onChange={handleImportChange}
            disabled={importing}
          />
        </label>
      </section>
    </div>
  );
}
