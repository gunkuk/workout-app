import { useRef, useState, type ChangeEvent } from "react";
import { exportSnapshot, importSnapshot, shareOrDownloadSnapshot, parseSnapshotJSON } from "../lib/backup";
import { ProgramLibrary } from "../components/ProgramLibrary";

/**
 * Task 7(C2) — 최소 설정 화면: 백업 내보내기/가져오기 버튼만(스펙 §2-8 범위, 그 외 설정 항목 없음).
 * 로직(스냅샷 조합, Web Share/다운로드 분기, JSON 파싱)은 전부 src/lib/backup.ts에 있고,
 * 이 화면은 그 함수들을 버튼/파일input에 배선하는 얇은 UI 레이어다(테스트도 backup.ts 쪽에서
 * DB·navigator mock으로 커버 — 이 화면 자체의 렌더링 테스트는 계획 범위 밖).
 */
export function SettingsScreen() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <a href="#/today">← 오늘로 돌아가기</a>
      <h2>설정</h2>
      {error && <div role="alert">{error}</div>}
      {status && <div role="status">{status}</div>}
      <ProgramLibrary />
      <section>
        <h3>백업</h3>
        <button type="button" onClick={handleExport} disabled={exporting}>
          내보내기
        </button>
        <label>
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
