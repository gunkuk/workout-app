import { useEffect } from "react";

export type Achievement = { id: string; text: string };

export type AchievementToastProps = {
  items: Achievement[];
  onDismiss: (id: string) => void;
};

const DISPLAY_MS = 2500;

/** 개별 토스트 — item.id로 1회만 마운트 타이머를 걸어, 스택에 새 항목이 추가/제거돼도(부모의
 *  items 배열 참조 변경) 이미 표시 중인 다른 토스트의 잔여 노출시간이 리셋되지 않게 한다. */
function Toast({ item, onDismiss }: { item: Achievement; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div className="achievement-toast" data-testid={`achievement-toast-${item.id}`}>
      {item.text}
    </div>
  );
}

/**
 * 성취 알림 토스트(UI15 item2) — PR(1RM/볼륨 신기록)·TM 증량 시 화면 상단에 짧게 뜨는 배너.
 * 2~3초 후 자동 소멸, 여러 개면 세로로 스택. store/domain 의존 없는 순수 표시 컴포넌트 —
 * 판정 로직(prDetection.ts)·큐잉은 호출부(TodayScreen) 책임.
 */
export function AchievementToast({ items, onDismiss }: AchievementToastProps) {
  if (items.length === 0) return null;

  return (
    <div className="achievement-toast-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
