import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScreenProps {
  children: ReactNode
  className?: string
}

/**
 * 화면 하나의 바깥 껍데기.
 *
 * `flex min-h-screen flex-col bg-background`가 42곳(사실상 모든 페이지)에서 반복되고
 * 있었다. 화면 전체 배경·최소 높이 규칙을 한 곳에서 바꿀 수 있게 감쌌다.
 */
export function Screen({ children, className }: ScreenProps) {
  return <div className={cn('flex min-h-screen flex-col bg-background', className)}>{children}</div>
}

interface ScreenBodyProps {
  children: ReactNode
  /** 내용을 세로·가로 가운데로 (로딩·빈 화면용) */
  centered?: boolean
  className?: string
}

/**
 * 화면의 본문 영역.
 *
 * `flex-1 overflow-y-auto pb-24`(8곳)와 가운데 정렬 변형
 * `flex flex-1 items-center justify-center pb-24`(6곳)를 하나로 합쳤다.
 * `pb-24`는 하단 네비에 내용이 가리지 않도록 두는 여백이라 기본값으로 둔다.
 */
export function ScreenBody({ children, centered = false, className }: ScreenBodyProps) {
  return (
    <main
      className={cn(
        'flex-1 pb-24',
        centered ? 'flex items-center justify-center' : 'overflow-y-auto',
        className
      )}
    >
      {children}
    </main>
  )
}
