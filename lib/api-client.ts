// 统一的客户端 API 调用封装：
// - 非 2xx 一律抛 ApiError（带状态码与后端 error 文案），调用方按 status 分支处理，
//   不再手写字符串匹配 "401"/"未找到"
// - 204 视为成功返回 undefined
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('网络异常，请检查连接后重试', 0)
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(data?.error || `请求失败（${res.status}）`, res.status)
  }
  return (await res.json()) as T
}

export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

export function errorMessage(err: unknown, fallback = '操作失败'): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}
