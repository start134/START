'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  durationMs: number
}

type ToastContextValue = {
  toast: (input: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => string
  success: (input: Omit<ToastItem, 'id' | 'durationMs' | 'variant'> & { durationMs?: number }) => string
  error: (input: Omit<ToastItem, 'id' | 'durationMs' | 'variant'> & { durationMs?: number }) => string
  info: (input: Omit<ToastItem, 'id' | 'durationMs' | 'variant'> & { durationMs?: number }) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let uid = 0
function nextId(): string {
  uid += 1
  return `toast-${Date.now().toString(36)}-${uid}`
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3000,
  error: 4000,
  info: 3000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
    },
    [clearTimer]
  )

  const dismissAll = useCallback(() => {
    for (const id of timers.current.keys()) clearTimer(id)
    timers.current.clear()
    setItems([])
  }, [clearTimer])

  const scheduleAutoDismiss = useCallback(
    (id: string, durationMs: number) => {
      clearTimer(id)
      const t = setTimeout(() => dismiss(id), durationMs)
      timers.current.set(id, t)
    },
    [clearTimer, dismiss]
  )

  const toast = useCallback<ToastContextValue['toast']>(
    (input) => {
      const id = nextId()
      const durationMs = input.durationMs ?? DEFAULT_DURATION[input.variant]
      const item: ToastItem = {
        id,
        variant: input.variant,
        title: input.title,
        description: input.description,
        durationMs,
      }
      setItems((prev) => [...prev, item])
      scheduleAutoDismiss(id, durationMs)
      return id
    },
    [scheduleAutoDismiss]
  )

  const success = useCallback<ToastContextValue['success']>(
    (input) => toast({ ...input, variant: 'success' }),
    [toast]
  )
  const error = useCallback<ToastContextValue['error']>(
    (input) => toast({ ...input, variant: 'error' }),
    [toast]
  )
  const info = useCallback<ToastContextValue['info']>(
    (input) => toast({ ...input, variant: 'info' }),
    [toast]
  )

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, info, dismiss, dismissAll }),
    [toast, success, error, info, dismiss, dismissAll]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用')
  return ctx
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: 'border-primary hover:border-primary',
  error: 'border-destructive hover:border-destructive',
  info: 'border-border hover:border-primary',
}
const VARIANT_TITLE: Record<ToastVariant, string> = {
  success: 'text-primary',
  error: 'text-destructive',
  info: 'text-foreground',
}
const VARIANT_LABEL: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ⓘ',
}

function Toaster({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto border bg-card/95 backdrop-blur p-4 shadow-lg transition-all animate-in fade-in slide-in-from-right ${VARIANT_BORDER[t.variant]}`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex-none text-sm ${VARIANT_TITLE[t.variant]}`}
              aria-hidden="true"
            >
              {VARIANT_LABEL[t.variant]}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${VARIANT_TITLE[t.variant]}`}>
                {t.title}
              </p>
              {t.description && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="关闭提示"
              className="flex-none text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
