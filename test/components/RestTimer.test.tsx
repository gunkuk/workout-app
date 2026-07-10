import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { RestTimer } from "../../src/components/RestTimer";

// Task 2 — RestTimer: 독립 컴포넌트(store/domain/storage 의존 없음). timestamp 기반 카운트다운 +
// visibilitychange 재계산(핵심 검증 대상 — interval 드리프트가 표시값에 누적되지 않음을 증명).

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function display(): string {
  return screen.getByTestId("rest-timer-display").textContent ?? "";
}

describe("RestTimer", () => {
  it("① 시작 전 초기 표시 — 기본 90초", () => {
    render(<RestTimer />);
    expect(display()).toBe("90초");
    expect(screen.getByRole("button", { name: "시작" })).toBeInTheDocument();
  });

  it("② ± 조정 — 시작 전 15초 단위로 변경, 최소 15초 바닥", () => {
    render(<RestTimer />);

    fireEvent.click(screen.getByRole("button", { name: "휴식시간 증가" }));
    expect(display()).toBe("105초");

    fireEvent.click(screen.getByRole("button", { name: "휴식시간 감소" }));
    fireEvent.click(screen.getByRole("button", { name: "휴식시간 감소" }));
    expect(display()).toBe("75초");

    // 바닥(15초) 아래로는 내려가지 않음
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByRole("button", { name: "휴식시간 감소" }));
    }
    expect(display()).toBe("15초");
  });

  it("③ 시작 → 카운트다운(fake timer, timestamp 재계산)", () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(display()).toBe("90초");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(display()).toBe("85초");

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(display()).toBe("75초");
  });

  it("④ 0 도달 → onDone 정확히 1회 호출 + 완료 표시", () => {
    const onDone = vi.fn();
    render(<RestTimer onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(display()).toBe("완료");
    expect(onDone).toHaveBeenCalledTimes(1);

    // 이후 tick이 더 발생해도 재호출되지 않음
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("⑤ visibilitychange — interval이 안 돌아도 실경과시간 기준으로 재계산(드리프트 없음)", () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(display()).toBe("90초");

    // 실시간 30초 경과를 시뮬레이션하되, interval을 advance하지 않는다(tick 카운팅 방식이었다면
    // 여전히 90초로 보일 것 — setSystemTime은 Date.now()만 바꾸고 예약된 타이머를 발화시키지 않음).
    act(() => {
      vi.setSystemTime(Date.now() + 30_000);
    });
    expect(display()).toBe("90초"); // interval 미발화 — 아직 재계산 전

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(display()).toBe("60초"); // endTime - Date.now()로 즉시 재계산됨 (tick 카운팅이었다면 90초 그대로였을 것)
  });
});
