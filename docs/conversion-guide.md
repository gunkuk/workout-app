# 자연어 루틴 → 프로그램 JSON 변환 규약

**대상 독자: 이 변환을 수행할 (미래의) Claude Code 세션.** 사용자가 볼트(`LLM-Wiki/4. KK/Weight Lifting/routines/*.md`)에 자연어로 쓴 루틴을 표준 양식 JSON으로 옮기는 절차다. 해석(자연어→구조)은 네가 하고, 정답 검증은 아래 도구가 한다 — 도구를 건너뛰고 "맞을 것"이라 단정하지 마라.

## 절차 (닫힌 루프)
1. 자연어 루틴 읽기. 모호하면 **추측 말고 사용자에게 질문** (요일 매핑, %인지 고정무게인지, AMRAP 여부, 증량 규칙).
2. `schema/program.schema.json` + `schema/rules-catalog.md` 참조해 JSON 작성.
   - slotId 컨벤션: `w{주}d{일}-{운동}-{역할}` 예: `w1d5-bench-t1`
   - 같은 운동이 한 주에 2번 나오면 **증량 규칙은 한 슬롯에만** (불변식).
3. `npm run validate -- <파일>` → 에러 0이 될 때까지 수정.
4. `npm run render -- <파일> --tm bench=105 --tm squat=85 ...` → 출력된 세트표를 **원문과 나란히 놓고 세트 단위로 대조**. 무게·reps·AMRAP 위치가 다르면 JSON 수정 후 3부터 반복.
5. 렌더 표를 사용자에게 보여주고 확인받은 뒤 `programs/`에 저장·커밋. (Stage 2 이후: GitHub push → 앱에서 URL 가져오기.)

## 함정 목록 (검증 루프에서 실제로 나온 것)
- 벤치처럼 주 2회 등장하는 리프트: volume day 슬롯엔 rule·topSet 금지.
- T1 리프트가 T2 슬롯으로 재등장(화 OHP): rule 없이 볼륨 전용.
- 머신 악세사리 weightStep은 2.5가 아니라 실측(보통 5).
- topSet은 슬롯당 1개, `95%×1+`처럼 원문에 "+"가 붙은 최고중량 세트. 마지막 백오프 AMRAP(`65%×5+`)은 `backoff`.
