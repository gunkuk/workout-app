import { ProgramLibrary } from "../components/ProgramLibrary";

/**
 * 프로그램 탭(UI3) — 라이브러리를 하단 탭의 독립 화면으로 승격. 목록·전환·가져오기(파일/URL)·
 * 모드 설정은 기존 ProgramLibrary 컴포넌트가 전부 담당하므로, 이 화면은 제목만 얹은 얇은 래퍼다
 * (이전엔 설정 화면 안에 묻혀 있었음 — 사용자 요청으로 탭 승격).
 */
export function ProgramScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">프로그램</h1>
      <ProgramLibrary />
    </div>
  );
}
