import { NextResponse } from 'next/server'
import { getDailyStats, getTotalViews } from '@/lib/kv-stats'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/stats')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)
  
  // 限制范围 7-90 天
  const safeDays = Math.max(7, Math.min(90, days))
  
  log.debug('统计 API 被请求', {
    requestedDays: days,
    safeDays,
  })
  
  try {
    const startTime = performance.now()
    const [daily, totalViews] = await Promise.all([
      getDailyStats(safeDays),
      getTotalViews(),
    ])
    
    const todayViews = daily.length > 0 ? daily[daily.length - 1].views : 0
    const weekViews = daily.slice(-7).reduce((sum, d) => sum + d.views, 0)
    const duration = Math.round(performance.now() - startTime)
    
    const response = {
      daily,
      totalViews,
      todayViews,
      weekViews,
    }
    
    log.info('统计 API 响应成功', {
      days: safeDays,
      dataPoints: daily.length,
      totalViews,
      todayViews,
      weekViews,
      durationMs: duration,
    })

    return NextResponse.json(response)
  } catch (err) {
    log.error('统计 API 响应失败', {
      days: safeDays,
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    // 不把内部错误细节返回给客户端
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}
