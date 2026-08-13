import { cn } from '@/lib/utils'
import { generateAvatar } from '@/lib/avatar'
import Icon from '@/components/common/Icon'

interface AvatarProps {
  /** 프로필 이미지 URL (없으면 닉네임 기반 자동 아바타 → person 아이콘 순으로 폴백) */
  src?: string | null
  alt?: string
  /**
   * 자동 아바타에 쓸 이름. 생략하면 `alt`를 쓴다 —
   * 대부분의 호출부가 이미 `alt`에 닉네임을 넘기고 있어서 따로 고칠 필요가 없다.
   */
  name?: string | null
  /** 원형 래퍼에 적용할 클래스 — 크기(size-10)·테두리 등 사이트별 스타일 */
  className?: string
  /** 이름조차 없을 때 person 아이콘 표시 여부 (기본 true) */
  fallback?: boolean
  /** person 아이콘에 적용할 클래스 — 아이콘 크기(text-[14px]) 등 */
  iconClassName?: string
}

/**
 * 사용자 프로필 원형 아바타.
 *
 * 표시 우선순위는 **업로드한 사진 → 닉네임 자동 아바타 → person 아이콘**이다.
 * 가운데 단계가 있는 이유는, 사진을 올린 사용자가 거의 없는 초기 상태에서 모두가
 * 같은 회색 아이콘으로 보이면 피드에서 작성자가 구분되지 않기 때문이다.
 *
 * 크기·테두리 등은 className으로 주입한다(예: "size-10 shrink-0").
 */
export function Avatar({
  src,
  alt = '',
  name,
  className,
  fallback = true,
  iconClassName,
}: AvatarProps) {
  const generated = src ? null : generateAvatar(name ?? alt)

  return (
    <div className={cn('overflow-hidden rounded-full bg-primary/10', className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : generated ? (
        // SVG라서 래퍼가 size-8이든 size-24든 글자가 원 크기에 맞춰 함께 커진다.
        <svg viewBox="0 0 40 40" className="size-full" role="img" aria-label={alt || undefined}>
          <rect width="40" height="40" fill={generated.bg} />
          <text
            x="20"
            y="20"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="19"
            fontWeight="600"
            fontFamily="Newsreader, serif"
            fill={generated.fg}
          >
            {generated.initial}
          </text>
        </svg>
      ) : fallback ? (
        <div className="flex size-full items-center justify-center">
          <Icon name="person" className={cn('text-primary/40', iconClassName)} />
        </div>
      ) : null}
    </div>
  )
}
