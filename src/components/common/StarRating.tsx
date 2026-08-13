import { cn } from '@/lib/utils'
import Icon from '@/components/common/Icon'

interface StarRatingProps {
  rating: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
}

export default function StarRating({ rating, size = 'md', className }: StarRatingProps) {
  // 백엔드 집계 오류 등으로 [0,5]를 벗어난 값(또는 NaN/Infinity)이 와도 Array.from에 음수 length가
  // 들어가 RangeError(화이트스크린)가 나지 않도록 진입부에서 clamp한다.
  const safeRating = Math.min(5, Math.max(0, Number.isFinite(rating) ? rating : 0))
  const fullStars = Math.floor(safeRating)
  const hasHalf = safeRating - fullStars >= 0.5
  const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0))

  return (
    <div className={cn('flex gap-0.5', className)}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <Icon
          name="star"
          filled
          className={cn('text-accent-gold', sizeMap[size])}
          key={`full-${i}`}
        />
      ))}
      {hasHalf && <Icon name="star_half" className={cn('text-accent-gold', sizeMap[size])} />}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Icon
          name="star"
          className={cn('text-muted-foreground/30', sizeMap[size])}
          key={`empty-${i}`}
        />
      ))}
    </div>
  )
}
