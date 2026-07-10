Task 0: setup — branch stage1, PACT action 001 registered
Task 1: complete (commits 6447385..169345f, review clean — Minor: 거부케이스는 Task 2가 담당)
Task 2: complete (commits 169345f..db721db, review clean)
Task 3: complete (commits db721db..17efe34, review clean — Minor: 커밋 제목 오타 '골각')
Task 4: complete (commits 17efe34..6fd19f2, review clean)
Task 5: complete (commits 6fd19f2..5f046b2, review clean — Minor참고: doubleProgression.sets 파라미터 미검증(문서엔 있음), 최종리뷰 목록行)
Task 6: complete (commits 5f046b2..fb133e7, review clean)
Task 7: complete (commits fb133e7..fd5cb06, review clean)
Task 8: complete (commits fd5cb06..de87600, review clean — 공식대조: repcheck+liftosaur 교차, 수정 0건)
=== Plan A (stage1-A-schema-tools) 완료 2026-07-05: 8/8 tasks, 26 tests ===
최종리뷰 이월 Minor 목록: (1) T3 커밋제목 오타'골각' (2) doubleProgression.sets 파라미터 문서-검증기 불일치 → Plan B에서 해소 예정
B1 Task 1: complete (commits 061d229..d8e5187, review clean)
B1 Task 2: complete (commits d8e5187..bd62c4a, review clean — import 규칙: 값 import는 확장자 없이)
B1 Task 3: complete (commits bd62c4a..a16b7c5, review clean)
B1 Task 4: complete (commits a16b7c5..38b9b96, review clean — 계획 카운트 산수오류 정정 39d8a82)
B1 Task 5: complete (commits 38b9b96..cc6f0d1, review clean)
B1 Task 6: complete (commits cc6f0d1..26df1ad — 에이전트 프로세스 사망 후 컨트롤러 회수: 계획 계약과 byte-diff 일치 확인, 66/66, tsc 0)
B1 Task 7: complete (commits 26df1ad..b5cde5e, review Approved — Minor 1건: fold-accessory.test.ts:61 toMatchObject가 missStreak/grace 미검증, 계획 원문 유래)
=== Plan B1 (stage1-B1-domain-fold) 완료 2026-07-09: 7/7 tasks, 73 tests, tsc 0 ===
이월 Minor 누적: (1) T3'골각' 오타 (2) doubleProgression.sets 문서-검증기 불일치 (3) fold-accessory.test.ts:61 부분검증 — 최종 whole-branch 리뷰에서 일괄 판단
B2 Task 1: complete (commits f382fe0..a35087b, review Critical 1건 발견·즉시수정 f35223b — frontSquat 표기 '스쿠트'→'스쿼트', 재검증 불요·1글자 수정)
B2 Task 2: complete (commits f35223b..61e3c7a, review Approved — greedy/rounding 명명위험 2건 직접 손계산 검증 통과)
B2 Task 3: complete (commits eae84bf..eae84bf, review Approved — 워밍업 연산순서(클램프→cap필터) 명명위험 base=21/25 직접 추적 검증 통과, critical 가드 정상 동작)
B2 Task 4: complete (commits 4c4d080..4c4d080, review Approved — 이월 Minor: nextCyclePos 중간분기(주+1 same-cycle)가 1주 시드로 미검증, 다주 프로그램 추가 시 테스트 필요)
B2 Task 5: complete (commits 353e312..353e312, review Approved — missingTM 슬롯레벨 가드·오라클 7종 전부 직접 재계산 검증)
B2 Task 6: complete (commits 353e312..17c347c, review Approved — 이월 Important: 외부세션-only 주(실세트 0)는 버킷 부재로 빈도 소실, Plan C 전 후속 검토 필요. externalSessions.programId 필수화는 계획 문면과 다르나 근거있는 설계결정으로 승인)
B2 Task 7: complete (commits 17c347c..372e0df, review Approved — foldState 재사용 확인·Epley 반올림 미열거 케이스까지 직접 검증)
B2 Task 8: complete (commits 372e0df..b048f8f, review Approved — 명명위험 3건(topSet 인덱스·increment 5·half-up 반올림) 전부 소스 대조 검증)
=== Plan B2 (stage1-B2-engine-analytics) 완료 2026-07-10: 8/8 tasks, 136 tests, tsc 0 ===
이월 목록 (Plan C 전/최종 whole-branch 리뷰에서 일괄 판단):
  (1) B1 T3 커밋제목 오타 '골각'
  (2) B1 doubleProgression.sets 파라미터 문서-검증기 불일치
  (3) B1 fold-accessory.test.ts:61 toMatchObject 부분검증(missStreak/grace 미확인)
  (4) B2 T4 cyclePos.nextCyclePos 중간분기(주+1 same-cycle) 1주 시드로 미검증 — 다주 프로그램 도입 시 테스트 추가
  (5) B2 T6 analytics — 외부세션-only 주(실세트 0)는 버킷 부재로 빈도 소실. Plan C 분석 화면 설계 전 검토 필요(주간 뷰가 그 주를 아예 안 보여줄 위험)

B2 후속(Plan C1 SDD 신규 레저):
C1 Task 1: complete (commits ad91041..7d06053, review Needs-fixes→해소 — 스크린샷 검증 누락 지적, 컨트롤러가 preview_eval/console/network로 3라우트 직접 검증 완료)
C1 Task 2: complete (commits 7d06053..a0a35bf, review Approved — FoldInput/programKey 구조 일치 명명위험 직접 추적 검증)
C1 Task 3: complete (commits a0a35bf..7da848b, review Approved — rollingCyclePos 시그니처 일치 확인)
C1 Task 4: complete (commits 7da848b..9dd06f7, review Approved — 두 critical 계약(sessionId 조인·needsInit UX) 모두 코드추적+테스트 검증)
C1 Task 5: complete (commits 9dd06f7..8ad96f2, review Approved — 8개 시드·악세사리 미시드·무라우팅 훅 확인. 이월 Minor: 온보딩 제출 중 실패 시 부분쓰기 롤백 없음)
C1 Task 6: complete (commits 8ad96f2..ddca677, review Approved — order.ts 재사용·sessionId 조인·C2 범위침범 없음 확인)
C1 Task 7: complete (commits ddca677..934818f, review Approved — empty강제라우팅·NavShell 조건부렌더·prop매칭 확인)
C1 Task 8: complete (commits 934818f..b96d5dc 자동 + 컨트롤러 직접 수동 브라우저 검증, review Approved — mock없는 진짜 E2E·리마운트로 영속 증명·다음날 콘텐츠 검증 확인)
=== Plan C1 (stage1-C1-app-shell) 완료 2026-07-10: 8/8 tasks, 170 tests, tsc 0, build 성공, 수동 골든패스 통과 ===
이월 목록 (Plan C2):
  캘린더 모드, TM 이력 차트, 주간 부위별 분석 대시보드(§2-4 하체 각주), 휴식 타이머, 플레이트 계산기 UI,
  운동 스킵/대체+통증일 프리셋 UI, 세션 노트, 프로그램 편집·라이브러리·전환 UI, JSON export/import(Web Share),
  GitHub Pages 배포(base path 재확정 필요 — 현재 './' 임시), 설치 iOS 수동 안내 상세, PWA 아이콘 실물 제작,
  외부세션-only 주 빈도소실(B2 T6 이월), 온보딩 부분쓰기 롤백(C1 T5 이월)
