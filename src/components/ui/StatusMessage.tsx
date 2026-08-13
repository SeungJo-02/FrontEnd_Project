import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'loading' | 'error' | 'hint'

interface StatusMessageProps {
  tone: Tone
  children: ReactNode
  /** 목록 하단의 추가 로딩·안내처럼 여백을 줄여야 할 때 */
  compact?: boolean
  className?: string
}

/**
 * 목록·화면 단위의 상태 한 줄(불러오는 중 / 실패 / 안내).
 *
 * 아래 세 조합이 화면마다 9곳씩 반복되던 것을 모았다:
 * - `py-10 text-center text-sm text-muted-foreground` (로딩)
 * - `py-10 text-center text-sm text-destructive` (에러)
 * - `py-4 text-center text-xs text-muted-foreground` (추가 로딩 등, compact)
 *
 * 역할에 맞는 ARIA도 함께 붙는다 — 화면마다 role/aria-busy를 손으로 챙기다 보니
 * 빠뜨린 곳이 있었다. tone만 정하면 접근성 속성은 자동으로 따라온다.
 */
export default function StatusMessage({
  tone,
  children,
  compact = false,
  className,
}: StatusMessageProps) {
  const isError = tone === 'error'
  const isLoading = tone === 'loading'

  return (
    <p
      role={isError ? 'alert' : 'status'}
      aria-busy={isLoading || undefined}
      className={cn(
        'text-center',
        compact ? 'py-4 text-xs' : 'py-10 text-sm',
        isError ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  )
}
