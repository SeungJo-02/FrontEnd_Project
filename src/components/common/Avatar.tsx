import { cn } from '@/lib/utils'

interface AvatarProps {
  /** 프로필 이미지 URL (없으면 person 아이콘 폴백) */
  src?: string | null
  alt?: string
  /** 원형 래퍼에 적용할 클래스 — 크기(size-10)·테두리 등 사이트별 스타일 */
  className?: string
  /** src 없을 때 person 아이콘 표시 여부 (기본 true) */
  fallback?: boolean
  /** person 아이콘(span)에 적용할 클래스 — 아이콘 크기(text-[14px]) 등 */
  iconClassName?: string
}

/**
 * 사용자 프로필 원형 아바타.
 * 이미지가 있으면 object-cover로 채우고, 없으면 person 아이콘 폴백을 보여준다.
 * 크기·테두리 등은 className으로 주입한다(예: "size-10 shrink-0").
 */
export function Avatar({ src, alt = '', className, fallback = true, iconClassName }: AvatarProps) {
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
      ) : fallback ? (
        <div className="flex size-full items-center justify-center">
          <span
            aria-hidden="true"
            className={cn('material-symbols-outlined text-primary/40', iconClassName)}
          >
            person
          </span>
        </div>
      ) : null}
    </div>
  )
}
