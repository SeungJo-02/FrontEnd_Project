import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 아이콘만 있는 버튼이라 스크린리더용 이름이 반드시 필요하다. */
  'aria-label': string
}

/**
 * 헤더의 뒤로가기·더보기처럼 아이콘 하나만 담는 원형 버튼.
 *
 * `flex size-10 items-center justify-center rounded-full text-primary transition-colors
 * hover:bg-primary/10` 조합이 8곳에서 그대로 반복되던 것을 옮겼다. 터치 영역(40px)이
 * 손가락 기준 최소 크기라 size는 고정한다 — 더 작게 쓰고 싶으면 아이콘 글자 크기를 줄인다.
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
IconButton.displayName = 'IconButton'

export default IconButton
