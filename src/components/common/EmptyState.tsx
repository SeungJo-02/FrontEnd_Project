import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Icon, { type IconName } from '@/components/common/Icon'

interface EmptyStateProps {
  /** material-symbols 아이콘 이름 (예: "menu_book") */
  icon: IconName
  /** 안내 문구 (조건부 텍스트 가능) */
  message: ReactNode
  /** 래퍼 클래스 override — py-16, bg-card 등 사이트별 스타일 */
  className?: string
  /** 아이콘(span)에 적용할 클래스 */
  iconClassName?: string
  /** 문구 아래 추가 요소(부가 설명, 액션 버튼 등) */
  children?: ReactNode
}

/**
 * 빈 목록 화면의 "아이콘 + 안내 문구" 블록.
 * 부가 설명이나 액션 버튼이 필요하면 children으로 전달한다.
 */
export function EmptyState({ icon, message, className, iconClassName, children }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-20', className)}>
      <Icon name={icon} className={cn('text-5xl text-muted-foreground/30', iconClassName)} />
      <p className="text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  )
}
