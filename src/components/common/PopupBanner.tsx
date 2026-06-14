import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface PopupBannerProps {
  imageUrl: string
  imageAlt?: string
  storageKey?: string
  onClose?: () => void
}

/**
 * 이미지 기반 팝업 배너. "하루동안 보지 않기"는 localStorage에
 * 내일 자정까지의 타임스탬프를 저장해서 재방문 시에도 숨김 유지.
 */
export default function PopupBanner({
  imageUrl,
  imageAlt = '팝업 배너',
  storageKey = 'popup-dismiss',
  onClose,
}: PopupBannerProps) {
  const dismissKey = `${storageKey}_dismissed_until`

  const [visible, setVisible] = useState(() => {
    try {
      const dismissedUntil = localStorage.getItem(dismissKey)
      if (dismissedUntil && new Date(dismissedUntil) > new Date()) return false
    } catch {
      /* Safari 프라이빗 모드 등 localStorage 접근 불가 시 팝업 표시 */
    }
    return true
  })

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setVisible(false)
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!visible) return
    closeButtonRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [visible, close])

  const dismissForDay = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    try {
      localStorage.setItem(dismissKey, tomorrow.toISOString())
    } catch {
      /* 저장 실패해도 세션 내 닫기는 동작 */
    }
    close()
  }

  if (!visible) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={imageAlt}
        className="relative w-[85vw] max-w-xs overflow-hidden rounded-2xl bg-card shadow-xl"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        <div className="aspect-square w-full">
          <img loading="lazy" src={imageUrl} alt={imageAlt} className="size-full object-cover" />
        </div>

        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={dismissForDay}
            className="flex-1 rounded-lg bg-primary/10 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            하루동안 보지 않기
          </button>
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
