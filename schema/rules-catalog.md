# 증량 규칙 카탈로그 (정본)

프로그램 JSON의 `progressionRuleId`는 아래 6개(4개 구현 + `linear` 미구현 + 2026-07-20 신설 2개)만 허용된다. 새 규칙 = 이 문서 + `lib/validation.mjs`의 `RULES` + (Plan B) 도메인 규칙 파일 1개 추가.

공통: 발효는 `SessionCompleted(status:"completed")` 시점, **TM당 사이클-주 발효 ≤1**(스펙 §2-3). 대체 세트(`substitutedFrom`)는 판정 입력에서 제외.

## nsunsTopSet — T1 메인리프트 (nSuns 원전)
- params: `{ "increment": number }` — 2~3렙 자동 증량폭 (kg). 벤치/OHP 2.5, 스쿼트/데드 5.
- 판정 입력: 이 슬롯의 `amrapRole:"topSet"` 세트의 실제 reps.
- 진리표: 0~1 → 제안(동결★/−5kg) · 2~3 → 자동 +increment · 4+ → 제안(+2×increment).
- 제약: 슬롯에 topSet 세트 1개 필수.

## t2LastSet — 독립 T2 리프트 (스모·프론트·인클라인·CGBP)
- params: `{ "increment": number }` — 인클라인/CGBP 2.5, 프론트 5, 스모 2.5(디스크).
- 판정: 슬롯 마지막 세트 목표 reps 완수 → 자동 +increment. 2사이클-주 연속 미완수 → 디로드 제안(−5% 또는 직전 TM).

## doubleProgression — 악세사리 (tracked load)
- params: `{ "repMin": int, "repMax": int, "weightStep": number, "sets": int }`
- 판정: 마지막 세트 actual reps ≥ repMax → 다음 세션 +weightStep, 목표 repMin으로 리셋. RIR 게이트 없음(2026-07-05 확정).
- 롤백: 증량 직후 1세션 유예 후, 2세션 연속 마지막 세트 < repMin → 이전 무게 제안.

## linear — 고정 주기 증량 (범용, 531류)
- **⚠️ 미구현** — 카탈로그에만 존재, `lib/validationCore.mjs`의 `RULES.linear`는 params 형태만 검증하고 fold.ts 판정 분기가 없다. `progressionRuleId: "linear"`를 쓰는 슬롯은 검증은 통과하지만 증량이 발효되지 않는다.
- params: `{ "increment": number }` — 사이클 완료 시 무조건 +increment 제안.

## linearTopSet — T1 메인리프트 선형 증량 (2026-07-20, kk-6day)
- params: `{ "increment": number, "minReps": number }`.
- 판정 입력: 슬롯의 `amrapRole:"topSet"` 세트 실제 reps (nsunsTopSet과 입력 경로 동일).
- 진리표: `actualReps >= minReps` → **자동** TM += increment(제안 아님, nsunsTopSet의 구간 판정과 달리 이진 판정). `actualReps < minReps` → 디로드 제안(`type: "tmDeload"` 재사용 — 동결 기본값 / −5% 반올림 옵션).
- 제약: 슬롯에 topSet 세트 1개 필수. 발효 상한(TM당 사이클-주 ≤1)은 nsunsTopSet과 동일하게 fold의 capKey 경로를 탄다.

## repLadder — T2·악세사리 per-set 렙 사다리 (2026-07-20, kk-6day)
- params: `{ "sets": number, "repMin": number, "repMax": number, "weightStep": number }` — `sets`는 슬롯의 실제 세트 수와 일치해야 한다.
- 세트 구성: 1~(sets-1) 세트는 목표 렙, 마지막 세트는 동일 무게 AMRAP(목표는 사다리 값, 초과 수행 허용 — `amrapRole:"backoff"`로 표시).
- **사다리 채움**: 현재 per-set 목표 배열에서 최솟값을 가진 가장 앞쪽 세트를 +1. 예(sets=4, repMin=5, repMax=7): `5555→6555→6655→6665→6666→7666→7766→7776→7777` (8스텝).
- 전 세트 목표 달성 시에만 한 스텝 전진(미달이면 그 스텝 유지 = 재도전, 상태 불변, 제안 없음).
- 최상단(sets*repMax) 달성 후 다음 세션: `weight += weightStep`, 사다리를 `sets*repMin`(바닥)으로 리셋.
- **상태 저장**: `AccessoryState.targetReps`(기존 필드 재사용)에 사다리 총합(`sets*repMin` ~ `sets*repMax`)을 저장한다. per-set 목표는 총합에서 결정론적으로 파생(`src/domain/rules/repLadder.ts`의 `deriveRepLadderTargets` — `extra = total - sets*repMin; level = repMin + floor(extra/sets); rem = extra % sets`; 앞 `rem`개 세트는 `level+1`, 나머지는 `level`). `programEngine.ts`가 렌더 시 이 파생을 재사용.
- 미초기화(needsInit) 시: doubleProgression과 동일 패턴으로 첫 세션 기록에서 weight 부트스트랩, total은 `sets*repMin`.
