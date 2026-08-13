import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
}

/**
 * 목록의 카드 한 장을 감싸는 껍데기.
 * `overflow-hidden rounded-card bg-card shadow-sm`가 6곳에서 반복되고 있었다.
 */
export default function Card({ children, className }: CardProps) {
  return (
    <div className={cn('overflow-hidden rounded-card bg-card shadow-sm', className)}>
      {children}
    </div>
  )
}
