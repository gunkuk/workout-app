import { expect } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { db } from "../../src/storage/db";

/**
 * 렌더된 모든 미완료 setrow를 순서대로 완료 처리한다 — 일반 행은 탭, 자유입력(needsInit) 행은
 * 값 입력 후 제출 버튼 클릭. 이미 완료(aria-label="완료됨")된 행은 건너뛴다.
 * opts.exclude로 특정 section(또는 컨테이너 요소)에 속한 행을 제외할 수 있다(ExerciseSwap의
 * completeAllRowsExcept 변형). (TodayScreen.test.tsx·goldenPath.test.tsx·ExerciseSwap.test.tsx
 * 중복 통합 — Stage1-R T2)
 */
export async function completeAllRows(
  container: HTMLElement,
  opts: { exclude?: HTMLElement | null } = {},
): Promise<void> {
  const { exclude } = opts;
  const rows = Array.from(container.querySelectorAll('[data-testid^="setrow-"]')) as HTMLElement[];
  for (const row of rows) {
    if (exclude && exclude.contains(row)) continue;
    if (row.querySelector('[aria-label="완료됨"]')) continue;
    const weightInput = row.querySelector('input[aria-label="무게 입력"]') as HTMLInputElement | null;
    if (weightInput) {
      const repsInput = row.querySelector('input[aria-label="렙 입력"]') as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: "20" } });
      fireEvent.change(repsInput, { target: { value: "10" } });
      fireEvent.click(within(row).getByRole("button", { name: /완료|저장/ }));
    } else {
      fireEvent.click(row);
    }
    await waitFor(() => expect(row.querySelector('[aria-label="완료됨"]')).toBeTruthy());
  }
}

/** 마운트 시 워밍업 자동기록(비동기)이 끝날 때까지 대기 — 이후 상호작용에서 act 경고 없이 안정적으로 동작. */
export async function waitForWarmupSettled(): Promise<void> {
  await waitFor(async () => {
    const recs = await db.setRecords.toArray();
    expect(recs.some((r) => r.setType === "warmup")).toBe(true);
  });
}
