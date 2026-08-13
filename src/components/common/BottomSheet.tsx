import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useModalA11y } from '@/hooks/useModalA11y'
import Icon from '@/components/common/Icon'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  /** 시트 상단 제목. 주면 헤더가 렌더되고 aria-labelledby로 연결된다. */
  title?: string
  /** 제목 줄 왼쪽에 X 닫기 버튼을 둔다(드래그 핸들만으로는 닫기가 잘 보이지 않는 시트용). */
  showCloseButton?: boolean
  /** 닫기 차단 (전송/저장 중). 오버레이 클릭·핸들·Escape 모두 무시된다. */
  isBlocked?: boolean
  /** `auto`는 내용 높이, `tall`은 화면의 85%를 차지하는 스크롤 시트(댓글 등). */
  size?: 'auto' | 'tall'
  /**
   * 닫혀도 children을 언마운트하지 않고 숨기기만 한다.
   * 시트 안에 입력 중인 초안이나 누적된 목록/카운트가 있어 재열람 시 잃으면 안 될 때 켠다.
   */
  keepMounted?: boolean
  /** 내용 영역(children 래퍼)에 붙일 클래스. */
  contentClassName?: string
  children: ReactNode
}

/** 퇴장 애니메이션 길이. index.css의 `.animate-sheet-out`과 맞춘다. */
const EXIT_DURATION_MS = 220

/**
 * 아래에서 올라오는 공용 바텀시트.
 *
 * `isOpen`이 false로 바뀌어도 즉시 언마운트하지 않고 `closing` 단계를 거쳐 퇴장 모션을 재생한 뒤
 * 사라진다. 호출부는 열림 여부만 관리하면 되고 애니메이션 타이밍을 알 필요가 없다.
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  showCloseButton = false,
  isBlocked = false,
  size = 'auto',
  keepMounted = false,
  contentClassName,
  children,
}: BottomSheetProps) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>(isOpen ? 'open' : 'closed')
  const handleRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (isOpen) {
      setPhase('open')
      return
    }
    // 한 번도 열린 적 없으면 퇴장 모션 없이 closed 유지
    setPhase(prev => (prev === 'open' ? 'closing' : prev))
  }, [isOpen])

  useEffect(() => {
    if (phase !== 'closing') return
    const timer = setTimeout(() => setPhase('closed'), EXIT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // 퇴장 애니메이션이 끝날 때까지 시트는 화면을 덮고 있으므로, 스크롤 잠금도 그 동안 유지한다.
  useModalA11y({
    isOpen: phase !== 'closed',
    onClose,
    isBlocked,
    initialFocusRef: handleRef,
  })

  const hasOpenedRef = useRef(isOpen)
  useEffect(() => {
    if (isOpen) hasOpenedRef.current = true
  }, [isOpen])

  const isHidden = phase === 'closed'
  // keepMounted면 한 번 열린 뒤로는 display:none으로만 숨겨 children의 상태를 보존한다.
  if (isHidden && !(keepMounted && hasOpenedRef.current)) return null

  const isClosing = phase === 'closing'
  const requestClose = () => {
    if (isBlocked) return
    onClose()
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col justify-end',
        isHidden && 'hidden'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : '바텀시트'}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-[2px]',
          isClosing ? 'animate-overlay-out' : 'animate-overlay-in'
        )}
        onClick={requestClose}
      />

      <div
        className={cn(
          'relative flex flex-col overflow-hidden rounded-t-[20px] bg-card shadow-2xl ring-1 ring-black/5',
          size === 'tall' && 'h-[85vh]',
          isClosing ? 'animate-sheet-out' : 'animate-sheet-in'
        )}
      >
        <button
          ref={handleRef}
          type="button"
          onClick={requestClose}
          disabled={isBlocked}
          aria-label="시트 닫기"
          className="flex h-7 w-full shrink-0 items-center justify-center pt-2.5"
        >
          <div className="h-1 w-10 rounded-full bg-foreground/15" />
        </button>

        {title && (
          <div className="relative shrink-0 border-b border-border px-5 pb-3 pt-1">
            {showCloseButton && (
              <button
                type="button"
                onClick={requestClose}
                disabled={isBlocked}
                aria-label="닫기"
                className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <Icon name="close" className="text-xl" />
              </button>
            )}
            <h2 id={titleId} className="text-center text-base font-bold">
              {title}
            </h2>
          </div>
        )}

        <div className={cn('min-h-0 flex-1', size === 'tall' && 'flex flex-col', contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}
