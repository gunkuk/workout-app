/**
 * 하위호환 re-export — 실제 정의는 src/domain/sessionId.ts로 이동(Stage1-UI7, store에서도
 * 재사용해야 하는데 store는 screens를 import할 수 없어 순수 로직을 domain으로 옮겼다).
 * 기존 import 경로(./sessionId, ./today/sessionId)를 그대로 쓰는 코드가 많아 이 shim을 유지한다.
 */
export { sessionIdFor, setIdFor } from "../../domain/sessionId";
