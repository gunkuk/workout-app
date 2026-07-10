import { db } from "../../src/storage/db";

/** 전체 테이블 초기화 — 9개 테스트 파일에 중복된 7-table clear 블록 통합(Stage1-R T2). */
export async function resetDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}
