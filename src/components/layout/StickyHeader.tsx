import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StickyHeaderProps {
  children: ReactNode
  className?: string
}

/**
 * 스크롤해도 상단에 붙어 있는 화면 헤더.
 *
 * `sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md`가
 * 6곳에서 그대로 반복되고 있었다. z-index를 여기 한 곳에서 관리해야 새 오버레이가
 * 생겼을 때 헤더와의 층 순서를 한 번에 조정할 수 있다.
 */
export default function StickyHeader({ children, className }: StickyHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md',
        className
      )}
    >
      {children}
    </header>
  )
}
