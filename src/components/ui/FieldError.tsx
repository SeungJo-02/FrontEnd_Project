import { cn } from '@/lib/utils'

interface FieldErrorProps {
  /** 표시할 오류. 없으면 아무것도 렌더하지 않는다. */
  message?: string | null
  className?: string
}

/**
 * 폼 입력 아래에 붙는 오류 문구.
 *
 * `ml-1 text-xs text-destructive`가 16곳에서 반복되고 있었다. 조건부 렌더까지 여기서
 * 처리하므로 호출부는 `<FieldError message={errors.email?.message} />` 한 줄로 끝난다.
 */
export default function FieldError({ message, className }: FieldErrorProps) {
  if (!message) return null
  return (
    <p role="alert" className={cn('ml-1 text-xs text-destructive', className)}>
      {message}
    </p>
  )
}
