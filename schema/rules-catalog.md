# 증량 규칙 카탈로그 (정본)

프로그램 JSON의 `progressionRuleId`는 아래 4개만 허용된다. 새 규칙 = 이 문서 + `lib/validation.mjs`의 `RULES` + (Plan B) 도메인 규칙 파일 1개 추가.

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
- params: `{ "increment": number }` — 사이클 완료 시 무조건 +increment 제안.
