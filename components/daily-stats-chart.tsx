'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'

type DailyStat = {
  date: string
  views: number
}

type Props = {
  data: DailyStat[]
  days?: number
}

const MAX_RENDER_POINTS = 200
const MIN_POINT_GAP = 4

export function DailyStatsChart({ data, days = 30 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [width, setWidth] = useState(0)
  const [renderTime, setRenderTime] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)

  const { ref, width: containerWidth } = useSize()

  // 1. 截取指定天数数据
  const rawData = useMemo(() => data.slice(-days), [data, days])

  // 2. 数据降采样：超过 MAX_RENDER_POINTS 时聚合
  const { visibleData, downsampled, originalCount } = useMemo(() => {
    if (rawData.length <= MAX_RENDER_POINTS) {
      return {
        visibleData: rawData,
        downsampled: false,
        originalCount: rawData.length,
      }
    }
    const bucketSize = Math.ceil(rawData.length / MAX_RENDER_POINTS)
    const result: DailyStat[] = []
    for (let i = 0; i < rawData.length; i += bucketSize) {
      const bucket = rawData.slice(i, i + bucketSize)
      const avgDate = bucket[Math.floor(bucket.length / 2)]?.date ?? bucket[0].date
      const sumViews = bucket.reduce((s, d) => s + d.views, 0)
      result.push({ date: avgDate, views: Math.round(sumViews / bucket.length) })
    }
    return {
      visibleData: result,
      downsampled: true,
      originalCount: rawData.length,
    }
  }, [rawData])

  // 3. 用循环代替 Math.max(...array)，防止栈溢出
  const maxViews = useMemo(() => {
    let m = 1
    for (const d of visibleData) {
      if (d.views > m) m = d.views
    }
    return m
  }, [visibleData])

  const totalInRange = useMemo(
    () => visibleData.reduce((sum, d) => sum + d.views, 0),
    [visibleData]
  )

  // 4. 缓存几何计算
  const geometry = useMemo(() => {
    const padding = { top: 20, right: 16, bottom: 28, left: 40 }
    const chartWidth = Math.max(280, containerWidth - padding.left - padding.right)
    const chartHeight = 160
    const stepX = visibleData.length > 1 ? chartWidth / (visibleData.length - 1) : chartWidth

    const scaleY = (v: number) =>
      chartHeight - (v / maxViews) * (chartHeight - padding.top - padding.bottom) - padding.bottom

    // 预计算所有坐标
    const points = visibleData.map((d, i) => ({
      x: padding.left + i * stepX,
      y: scaleY(d.views),
      views: d.views,
      date: d.date,
    }))

    // 生成路径
    let pathD = ''
    if (points.length > 0) {
      pathD = `M${points[0].x},${points[0].y}`
      for (let i = 1; i < points.length; i++) {
        pathD += ` L${points[i].x},${points[i].y}`
      }
    }

    const areaD = points.length > 0
      ? `${pathD} L${points[points.length - 1].x},${chartHeight} L${points[0].x},${chartHeight} Z`
      : ''

    // X 轴刻度（最多 7 个标签）
    const tickInterval = Math.max(1, Math.floor(visibleData.length / 7))
    const ticks: number[] = []
    for (let i = 0; i < visibleData.length; i += tickInterval) {
      ticks.push(i)
    }
    if (ticks[ticks.length - 1] !== visibleData.length - 1) {
      ticks.push(visibleData.length - 1)
    }

    return { padding, chartWidth, chartHeight, stepX, scaleY, points, pathD, areaD, ticks }
  }, [visibleData, containerWidth, maxViews])

  const formatDate = useCallback((dateStr: string) => {
    const [, m, d] = dateStr.split('.')
    return `${m}.${d}`
  }, [])

  // 5. 单一 SVG 事件处理：替代 N 个 onMouseEnter
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (geometry.points.length === 0) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const scaleX = (geometry.padding.left + geometry.chartWidth + geometry.padding.right) / rect.width
      const mouseX = (e.clientX - rect.left) * scaleX
      const chartLeft = geometry.padding.left
      const chartRight = geometry.padding.left + geometry.chartWidth

      if (mouseX < chartLeft || mouseX > chartRight) {
        if (hoverIdx !== null) setHoverIdx(null)
        return
      }

      // 二分查找最近数据点
      const relativeX = mouseX - chartLeft
      const idx = geometry.stepX > 0 ? Math.round(relativeX / geometry.stepX) : 0
      const clamped = Math.max(0, Math.min(geometry.points.length - 1, idx))

      if (hoverIdx !== clamped) {
        setHoverIdx(clamped)
      }
    },
    [geometry, hoverIdx]
  )

  const handleMouseLeave = useCallback(() => setHoverIdx(null), [])

  // 6. 渲染完成日志
  useEffect(() => {
    const t0 = performance.now()
    if (visibleData.length > 0 && typeof window !== 'undefined') {
      console.info('[DailyStatsChart] 图表渲染数据', {
        dataPoints: visibleData.length,
        originalDataPoints: originalCount,
        downsampled,
        requestedDays: days,
        maxViews,
        totalInRange,
        dateRange: `${visibleData[0]?.date} ~ ${visibleData[visibleData.length - 1]?.date}`,
        width: containerWidth,
      })
      setRenderTime(Math.round(performance.now() - t0))
    }
  }, [visibleData, days, maxViews, totalInRange, containerWidth, downsampled, originalCount])

  const { padding, chartWidth, chartHeight, scaleY, points, pathD, areaD, ticks } = geometry

  // 决定渲染哪些数据点（密集时跳过太近的点）
  const renderPoints = useMemo(() => {
    if (points.length <= 50) return points.map((p, i) => ({ ...p, idx: i, render: true }))
    let lastRenderedX = -Infinity
    return points.map((p, i) => {
      const render = p.x - lastRenderedX >= MIN_POINT_GAP
      if (render) lastRenderedX = p.x
      return { ...p, idx: i, render }
    })
  }, [points])

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium tracking-tight">阅读量趋势</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            过去 {days} 天 · 共 {totalInRange} 次阅读
            {downsampled && (
              <span className="ml-2 text-amber-500/80">
                (已降采样 {originalCount} → {visibleData.length} 点)
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">今日</p>
          <p className="text-lg font-semibold text-primary">
            {visibleData[visibleData.length - 1]?.views ?? 0}
          </p>
        </div>
      </div>

      {process.env.NODE_ENV === 'development' && renderTime > 0 && (
        <div className="mb-3 text-[10px] text-muted-foreground/60 font-mono">
          render: {renderTime}ms · points: {visibleData.length} · max: {maxViews}
          {downsampled && ` · downsampled: ${originalCount}→${visibleData.length}`}
        </div>
      )}

      <div ref={ref} className="relative w-full">
        <svg
          ref={svgRef}
          width="100%"
          height={chartHeight + padding.top + 10}
          viewBox={`0 0 ${padding.left + chartWidth + padding.right} ${chartHeight + padding.top + 10}`}
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* 网格线 */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = scaleY(maxViews * ratio)
            const label = Math.round(maxViews * ratio)
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartWidth}
                  y2={y}
                  className="stroke-border"
                  strokeWidth={1}
                  strokeDasharray={ratio === 0 ? '' : '3,3'}
                />
                <text
                  x={padding.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* 面积填充 */}
          {areaD && (
            <path d={areaD} className="fill-primary/10" />
          )}

          {/* 折线 */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* 数据点（仅渲染间距足够的点） */}
          {renderPoints.map((p) =>
            p.render ? (
              <circle
                key={p.idx}
                cx={p.x}
                cy={p.y}
                r={hoverIdx === p.idx ? 5 : 3}
                className={hoverIdx === p.idx ? 'fill-primary' : 'fill-primary/60'}
              />
            ) : null
          )}

          {/* X 轴标签 */}
          {ticks.map((i) => {
            const d = visibleData[i]
            if (!d) return null
            const p = points[i]
            return (
              <text
                key={i}
                x={p.x}
                y={chartHeight + 20}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {formatDate(d.date)}
              </text>
            )
          })}

          {/* 悬停提示 */}
          {hoverPoint && (
            <g>
              <line
                x1={hoverPoint.x}
                y1={padding.top}
                x2={hoverPoint.x}
                y2={chartHeight}
                className="stroke-primary/30"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <rect
                x={Math.min(
                  Math.max(hoverPoint.x - 50, padding.left),
                  padding.left + chartWidth - 100
                )}
                y={hoverPoint.y - 50}
                width={100}
                height={40}
                rx={4}
                className="fill-card"
                strokeWidth={1}
                stroke="currentColor"
              />
              <text
                x={Math.min(
                  Math.max(hoverPoint.x - 50, padding.left),
                  padding.left + chartWidth - 100
                ) + 50}
                y={hoverPoint.y - 34}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={11}
                fontWeight={500}
              >
                {formatDate(hoverPoint.date)}
              </text>
              <text
                x={Math.min(
                  Math.max(hoverPoint.x - 50, padding.left),
                  padding.left + chartWidth - 100
                ) + 50}
                y={hoverPoint.y - 18}
                textAnchor="middle"
                className="fill-primary"
                fontSize={13}
                fontWeight={600}
              >
                {hoverPoint.views} 次阅读
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
