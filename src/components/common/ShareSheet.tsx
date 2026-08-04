import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import { shareLink, toAbsoluteUrl, type ShareLinkOptions } from '@/lib/share'
import Icon, { type IconName } from '@/components/common/Icon'

interface ShareSheetProps extends ShareLinkOptions {
  isOpen: boolean
  onClose: () => void
}

/**
 * 공유 바텀시트. 인스타그램처럼 아래에서 올라와 공유 수단을 고르게 한다.
 *
 * 결과는 alert 대신 시트 내부 인라인 메시지로 알린다(모바일에서 alert는 시트 위에 겹쳐
 * 뜨면서 흐름을 끊는다). Web Share 미지원 환경에서는 '공유하기' 항목을 감춘다.
 */
export default function ShareSheet({ isOpen, onClose, title, text, path }: ShareSheetProps) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => {
    if (isOpen) setFeedback(null)
  }, [isOpen])

  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const run = async (mode: 'native' | 'copy') => {
    if (isSharing) return
    setIsSharing(true)
    setFeedback(null)
    try {
      if (mode === 'copy') {
        await navigator.clipboard.writeText(toAbsoluteUrl(path))
        setFeedback('링크가 복사되었습니다.')
        return
      }

      const result = await shareLink({ title, text, path })
      if (result === 'shared') onClose()
      else if (result === 'copied') setFeedback('링크가 복사되었습니다.')
      else setFeedback('공유에 실패했습니다.')
    } catch {
      setFeedback('링크 복사에 실패했습니다.')
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="공유" isBlocked={isSharing}>
      <div className="flex flex-col px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {canWebShare && (
          <SheetRow
            icon="ios_share"
            label="공유하기"
            disabled={isSharing}
            onClick={() => run('native')}
          />
        )}
        <SheetRow icon="link" label="링크 복사" disabled={isSharing} onClick={() => run('copy')} />

        {/* live region은 내용이 채워지기 전부터 붙어 있어야 스크린리더가 변경을 읽는다.
            조건부로 만들면 이미 채워진 채 등장해 그대로 무시되는 경우가 많다. */}
        <p
          role="status"
          aria-live="polite"
          className="px-4 pt-2 text-center text-sm text-muted-foreground empty:pt-0"
        >
          {feedback}
        </p>
      </div>
    </BottomSheet>
  )
}

function SheetRow({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-primary/5 disabled:opacity-50"
    >
      <Icon name={icon} className="text-[22px] text-foreground/70" />
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  )
}
