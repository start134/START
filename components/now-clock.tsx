'use client'

import { useEffect, useState } from 'react'

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad = (n: number) => n.toString().padStart(2, '0')

/**
 * 每秒刷新一次本地时间的 hook。SSR 期间返回 null，
 * mount 后立即塞一个 Date，避免 Hydration Mismatch。
 */
export function useNowClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export interface NowClockProps {
  /** 紧凑模式（嵌入 START 右侧时用）：超出截断 */
  inline?: boolean
  /** 仅显示日期+时间，隐藏周X（窄屏/紧凑场景） */
  compact?: boolean
}

/**
 * 精致版本地日期+时钟：
 *  - 11px / 细字重 / 0.18em 字间距，和 START 品牌字节奏一致
 *  - tabular-nums 防秒跳左右抖动
 *  - 中点 `·` 分隔 + 颜色三档分层
 */
export function NowClock({ inline = false, compact = false }: NowClockProps) {
  const now = useNowClock()
  if (!now) {
    return (
      <div className="font-mono text-[11px] font-light uppercase tracking-[0.18em] text-muted-foreground/0 tabular-nums">
        2026.00.00 · 周0 · 00:00:00
      </div>
    )
  }
  const date = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
  const weekday = WEEKDAY_CN[now.getDay()]
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const Sep = () => (
    <span aria-hidden="true" className="mx-2 text-foreground/20">
      ·
    </span>
  )
  const showWeekday = !compact
  return (
    <div
      className={`font-mono text-[11px] font-light uppercase tracking-[0.18em] tabular-nums ${
        inline ? 'truncate' : ''
      }`}
      aria-live="off"
    >
      <span className="text-muted-foreground">{date}</span>
      {showWeekday && (
        <>
          <Sep />
          <span className="text-muted-foreground/80">{weekday}</span>
        </>
      )}
      <Sep />
      <span className="text-primary/90">{time}</span>
    </div>
  )
}

export default NowClock
