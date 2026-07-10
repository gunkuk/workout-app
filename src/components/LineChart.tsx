export type LineChartPoint = { at: string; value: number };

export type LineChartProps = {
  points: LineChartPoint[];
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
 */
export function LineChart({ points, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: LineChartProps) {
  if (points.length < 2) {
    return <div data-testid="linechart-empty">{EMPTY_TEXT}</div>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerWidth = width - PADDING * 2;
  const innerHeight = height - PADDING * 2;
  const lastIndex = points.length - 1;

  const coords = points.map((p, i) => ({
    x: PADDING + (i / lastIndex) * innerWidth,
    y: PADDING + innerHeight - ((p.value - min) / range) * innerHeight,
  }));

  const labelCount = Math.min(MAX_LABELS, points.length);
  const labelIndices = [
    ...new Set(
      Array.from({ length: labelCount }, (_, i) => Math.round((i * lastIndex) / Math.max(labelCount - 1, 1))),
    ),
  ];

  return (
    <svg data-testid="linechart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img">
      <polyline
        data-testid="linechart-polyline"
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {labelIndices.map((i) => {
        const point = points[i];
        const coord = coords[i];
        if (!point || !coord) return null;
        return (
          <text key={i} x={coord.x} y={height - 4} fontSize={9} textAnchor="middle">
            {formatDateLabel(point.at)}
          </text>
        );
      })}
    </svg>
  );
}

function formatDateLabel(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
