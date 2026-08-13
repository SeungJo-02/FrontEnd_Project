import { cn } from '@/lib/utils'

interface ErrorBoxProps {
  /** 표시할 오류. 없으면 아무것도 렌더하지 않는다. */
  message?: string | null
  className?: string
}

/**
 * 폼·시트 안에 끼워 넣는 오류 배너. 화면 전체를 대체하지 않고 자리만 차지한다.
 * `rounded-lg bg-destructive/10 …` 조합이 6곳에서 반복되던 것을 모았다.
 */
export default function ErrorBox({ message, className }: ErrorBoxProps) {
  if (!message) return null
  return (
    <p
      role="alert"
      className={cn(
        'rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive',
        className
      )}
    >
      {message}
    </p>
  )
}
