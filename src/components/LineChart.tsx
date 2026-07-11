export type LineChartPoint = { at: string; value: number };
export type LineChartSeriesLabels = { s1: string; s2: string };

export type LineChartProps = {
  points: LineChartPoint[];
  /** 2번째 시리즈(선택, opt-in) — 제공 시에만 듀얼 모드로 렌더. 미제공 시 기존 단일 시리즈와
   *  완전히 동일하게 렌더한다(UI5 T2, 기존 호출부 무영향 계약). */
  series2?: LineChartPoint[];
  /** 듀얼 시리즈 범례 라벨 — 제공 시에만 차트 아래 범례 행을 렌더. */
  labels?: LineChartSeriesLabels;
  width?: number;
  height?: number;
};

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 140;
const PADDING = 24;
const MAX_LABELS = 4;
const EMPTY_TEXT = "데이터 부족";

/**
 * 범용 경량 SVG 라인차트 — 의존성 없음(스펙 §3.4 "차트 경량 SVG" 지시대로 라이브러리 없이 직접 그린다).
 * x축 = 시간순 인덱스(points는 호출부가 이미 시간순 정렬해 넘긴다는 계약 — tmHistory·e1rmSeries
 * 둘 다 자체적으로 at 오름차순 정렬해 반환하므로 이 컴포넌트는 재정렬하지 않는다), 날짜 라벨은
 * 겹침 방지를 위해 최대 MAX_LABELS개만 균등 인덱스 샘플링해 렌더한다.
 * y축은 데이터 min~max로 자동 스케일(모든 값이 같아 range가 0이면 1로 대체해 0 나눗셈 방지).
 * 점 0~1개는 선을 그릴 수 없으므로 폴리라인 대신 "데이터 부족" 안내로 대체한다.
 *
 * 듀얼 시리즈(UI5 T2, opt-in) — series2 제공 시 series1(골드)·series2(틸)를 같은 viewBox에 겹쳐 그리되,
 * 각자 자기 min/max로 독립 정규화한다(값의 단위·범위가 다른 두 지표를 한 차트에 표시하는 목적 —
 * 예: 몸무게 kg vs 체지방 %). x좌표도 각 시리즈 자신의 길이 기준 인덱스 정규화(시각 정렬은 하지
 * 않음 — 기존 단일 시리즈와 동일한 "인덱스 균등분할" 방식을 그대로 시리즈별로 적용한 것뿐이라
 * 별도 시간축 매핑을 추가하지 않아도 단순함 기준을 유지한다). labels 제공 시에만 차트 아래 범례
 * (색 점 + 라벨 + 최신값)를 렌더.
 */
export function LineChart({ points, series2, labels, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: LineChartProps) {
  const dualMode = series2 !== undefined;
  const hasSeries1 = points.length >= 2;
  const hasSeries2 = dualMode && series2!.length >= 2;

  if (!hasSeries1 && !hasSeries2) {
    return (
      <div data-testid="linechart-empty" className="linechart-empty">
        {EMPTY_TEXT}
      </div>
    );
  }

  const innerWidth = width - PADDING * 2;
  const innerHeight = height - PADDING * 2;

  const coords1 = hasSeries1 ? scaleCoords(points, innerWidth, innerHeight) : [];
  const coords2 = hasSeries2 ? scaleCoords(series2!, innerWidth, innerHeight) : [];

  // 날짜 라벨은 항상 series1(있으면) 기준 — 둘 다 없을 순 없으므로(위에서 이미 early return) series1
  // 없으면 series2를 라벨 소스로 대체.
  const labelSource = hasSeries1 ? points : series2!;
  const labelCoords = hasSeries1 ? coords1 : coords2;
  const lastLabelIndex = labelSource.length - 1;
  const labelCount = Math.min(MAX_LABELS, labelSource.length);
  const labelIndices = [
    ...new Set(
      Array.from({ length: labelCount }, (_, i) => Math.round((i * lastLabelIndex) / Math.max(labelCount - 1, 1))),
    ),
  ];

  const chart = (
    <svg
      data-testid="linechart"
      className="linechart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
    >
      {hasSeries1 && (
        <polyline
          data-testid="linechart-polyline"
          className="linechart-polyline"
          points={coords1.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          strokeWidth={2}
          style={dualMode ? { stroke: "var(--gold)" } : undefined}
        />
      )}
      {hasSeries2 && (
        <polyline
          data-testid="linechart-polyline-s2"
          className="linechart-polyline"
          points={coords2.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          strokeWidth={2}
          style={{ stroke: "var(--teal)" }}
        />
      )}
      {labelIndices.map((i) => {
        const point = labelSource[i];
        const coord = labelCoords[i];
        if (!point || !coord) return null;
        return (
          <text key={i} x={coord.x} y={height - 4} fontSize={9} textAnchor="middle">
            {formatDateLabel(point.at)}
          </text>
        );
      })}
    </svg>
  );

  if (!labels) return chart;

  const latest1 = points.at(-1);
  const latest2 = series2?.at(-1);

  return (
    <div data-testid="linechart-wrap">
      {chart}
      <div data-testid="linechart-legend" className="linechart-legend">
        <span className="linechart-legend-item">
          <span className="linechart-legend-dot" style={{ background: "var(--gold)" }} />
          {labels.s1} {latest1 ? formatLegendValue(latest1.value) : "-"}
        </span>
        <span className="linechart-legend-item">
          <span className="linechart-legend-dot" style={{ background: "var(--teal)" }} />
          {labels.s2} {latest2 ? formatLegendValue(latest2.value) : "-"}
        </span>
      </div>
    </div>
  );
}

function scaleCoords(pts: LineChartPoint[], innerWidth: number, innerHeight: number): { x: number; y: number }[] {
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const lastIndex = pts.length - 1;
  return pts.map((p, i) => ({
    x: PADDING + (i / lastIndex) * innerWidth,
    y: PADDING + innerHeight - ((p.value - min) / range) * innerHeight,
  }));
}

function formatLegendValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatDateLabel(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
