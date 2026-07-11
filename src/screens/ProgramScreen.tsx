import { useState } from "react";
import { ProgramLibrary } from "../components/ProgramLibrary";
import { useProgramStore } from "../store/programStore";

/**
 * 프로그램 탭(UI3) — 라이브러리를 하단 탭의 독립 화면으로 승격. 목록·전환·가져오기(파일/URL)·
 * 모드 설정은 기존 ProgramLibrary 컴포넌트가 전부 담당하므로, 이 화면은 제목만 얹은 얇은 래퍼다
 * (이전엔 설정 화면 안에 묻혀 있었음 — 사용자 요청으로 탭 승격).
 */

/** description 텍스트를 줄 단위로 나눠 가벼운 마크다운 스타일을 입힌다 (마크다운 라이브러리 없이). */
function DescriptionText({ text }: { text: string }) {
  return (
    <div style={{ lineHeight: 1.6 }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: "1.05em", marginTop: i === 0 ? 0 : "0.8em" }}>
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <div key={i} style={{ fontWeight: 600, fontSize: "0.95em", marginTop: "0.5em" }}>
              {line.slice(4)}
            </div>
          );
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

export function ProgramScreen() {
  const description = useProgramStore((s) => s.activeProgram?.description);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="screen">
      <h1 className="screen-title">프로그램</h1>
      {description && (
        <div className="settings-card program-description-card">
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "설명 접기 ▴" : "설명 보기 ▾"}
          </button>
          {expanded && <DescriptionText text={description} />}
        </div>
      )}
      <ProgramLibrary />
    </div>
  );
}
