import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  /** 위쪽 작은 설명 (예: "올해 읽은 책") */
  label: string
  /** 아래쪽 큰 숫자 */
  value: ReactNode
  className?: string
}

/**
 * 프로필의 통계 타일 한 칸. 라벨 + 큰 숫자 조합이 6곳에서 반복되고 있었다.
 */
export default function StatTile({ label, value, className }: StatTileProps) {
  return (
    <div className={cn('rounded-tile bg-card px-3 py-5 text-center shadow-sm', className)}>
      <p className="text-xs font-semibold text-primary/60">{label}</p>
      <p className="mt-2 text-3xl font-bold text-primary">{value}</p>
    </div>
  )
}
