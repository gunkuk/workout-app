import { useState } from "react";
import { isIOS } from "../lib/platform";

const SUPPRESS_KEY = "install-banner-dismissed";

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Task 5(C3) — 온보딩에만 있던 설치 배너를 App 레벨로 승격(스펙 §2-8): standalone 미감지 시
 * 모든 화면 위에 상시 노출. 닫기 버튼은 sessionStorage로 그 브라우저 세션 동안만 억제한다.
 */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(SUPPRESS_KEY) === "1");

  if (isStandalone() || dismissed) return null;

  return (
    <div role="status" data-testid="install-banner">
      {isIOS()
        ? "설치: 공유 버튼 → 홈 화면에 추가"
        : "설치: 브라우저 메뉴에서 '홈 화면에 추가'를 선택하세요"}
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => {
          sessionStorage.setItem(SUPPRESS_KEY, "1");
          setDismissed(true);
        }}
      >
        닫기
      </button>
    </div>
  );
}
