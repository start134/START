// 服务端日志工具：带时间戳与上下文标签，统一格式输出到 stdout/stderr。
// 仅用于服务端模块（posts-store / route handlers），不要在客户端组件引入。

type Level = 'info' | 'warn' | 'error' | 'debug'

const LEVEL_STYLE: Record<Level, string> = {
  info: '\x1b[36m', // 青色
  warn: '\x1b[33m', // 黄色
  error: '\x1b[31m', // 红色
  debug: '\x1b[90m', // 灰色
}
const RESET = '\x1b[0m'

function timestamp(): string {
  const d = new Date()
  return (
    d.toISOString().replace('T', ' ').replace(/\..+/, '') +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  )
}

function format(level: Level, scope: string, message: string, meta?: unknown): string {
  const prefix = `[${timestamp()}] ${LEVEL_STYLE[level]}${level.toUpperCase().padEnd(5)}${RESET} [${scope}]`
  if (meta === undefined) return `${prefix} ${message}`
  let metaStr: string
  try {
    metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta)
  } catch {
    metaStr = String(meta)
  }
  return `${prefix} ${message} ${metaStr}`
}

export function createLogger(scope: string) {
  return {
    info(message: string, meta?: unknown) {
      console.info(format('info', scope, message, meta))
    },
    warn(message: string, meta?: unknown) {
      console.warn(format('warn', scope, message, meta))
    },
    error(message: string, meta?: unknown) {
      console.error(format('error', scope, message, meta))
    },
    debug(message: string, meta?: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(format('debug', scope, message, meta))
      }
    },
  }
}

export type Logger = ReturnType<typeof createLogger>
