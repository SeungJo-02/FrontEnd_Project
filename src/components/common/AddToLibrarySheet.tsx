import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReadingStatus } from '@/api/library'
import BottomSheet from './BottomSheet'
import Icon from './Icon'
import { cn } from '@/lib/utils'
import { READING_STATUS_META, READING_STATUS_ORDER } from '@/constants/library'
import {
  getReadingProgress,
  saveReadingProgress,
  type ProgressUnit,
} from '@/lib/readingProgressStore'

interface AddToLibrarySheetProps {
  isOpen: boolean
  onClose: () => void
  onSave: (status: ReadingStatus) => void | Promise<void>
  bookId: string
  defaultStatus?: ReadingStatus
  /** 쪽수 기반 진행률 환산에 쓴다. 도서 상세에서 알 때만 넘긴다. */
  totalPages?: number | null
  /** 서버가 알고 있는 시작일(ISO). 로컬에 저장된 값이 없을 때 초기값으로 쓴다. */
  serverStartedAt?: string | null
}

/** ISO 또는 `YYYY-MM-DD`를 date input이 받는 `YYYY-MM-DD`로 맞춘다. */
function toInputDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 독서 상태·기간·독서량을 한 화면에서 정하는 시트.
 *
 * 독서 상태만 서버로 전송된다(`onSave`). 서재 API가 시작일·독서량 필드를 받지 않아
 * 그 둘은 `readingProgressStore`(localStorage)에 저장하고, 날짜별 독서 기록의 진행률
 * 표시에 쓰인다.
 */
export default function AddToLibrarySheet({
  isOpen,
  onClose,
  onSave,
  bookId,
  defaultStatus,
  totalPages = null,
  serverStartedAt = null,
}: AddToLibrarySheetProps) {
  const [selected, setSelected] = useState<ReadingStatus>(defaultStatus ?? 'want_to_read')
  const [startedAt, setStartedAt] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<ProgressUnit>('page')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const navigate = useNavigate()

  const numericBookId = Number(bookId)

  /** 다 읽은 책은 분량이 항상 끝이므로 사용자가 고칠 여지를 두지 않는다. */
  const isFinished = selected === 'finished'
  const maxAmount = unit === 'percent' ? 100 : totalPages
  const displayAmount = isFinished
    ? unit === 'percent'
      ? '100'
      : totalPages != null
        ? String(totalPages)
        : ''
    : amount

  // 쪽수를 모르는 책을 '읽은 책'으로 두면 쪽 단위로는 끝을 표현할 수 없다 → 퍼센트로 전환해 100%를 보인다.
  useEffect(() => {
    if (isFinished && totalPages == null) setUnit('percent')
  }, [isFinished, totalPages])

  const stepAmount = (delta: number) => {
    if (isFinished) return
    const parsed = amount.trim() === '' ? 0 : Number(amount)
    const current = Number.isFinite(parsed) ? parsed : 0
    let next = current + delta
    // 0에서 한 번 더 내리면 마지막 쪽으로 넘어간다 — 다 읽은 책을 빠르게 지정하는 동선.
    if (next < 0) next = maxAmount ?? 0
    if (maxAmount != null && next > maxAmount) next = maxAmount
    setAmount(String(next))
  }

  // 열릴 때마다 저장된 값으로 폼을 되돌린다.
  useEffect(() => {
    if (!isOpen) return
    setSelected(defaultStatus ?? 'want_to_read')
    setSaveError(null)

    const stored = Number.isFinite(numericBookId)
      ? getReadingProgress(numericBookId)
      : { startedAt: null, amount: null, unit: 'page' as ProgressUnit, totalPages: null }
    setStartedAt(toInputDate(stored.startedAt ?? serverStartedAt))
    setAmount(stored.amount != null ? String(stored.amount) : '')
    setUnit(stored.unit)
  }, [isOpen, defaultStatus, numericBookId, serverStartedAt])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(selected)
      if (Number.isFinite(numericBookId)) {
        // 다 읽은 책은 화면에 보이는 값(최대 쪽수/100%)을 그대로 저장한다.
        const parsedAmount = displayAmount.trim() === '' ? null : Number(displayAmount)
        saveReadingProgress(numericBookId, {
          startedAt: startedAt || null,
          amount: Number.isFinite(parsedAmount as number) ? (parsedAmount as number) : null,
          unit,
          totalPages,
        })
      }
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const isEditing = defaultStatus != null

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="어떤 책인가요?"
      showCloseButton
      isBlocked={isSaving}
    >
      <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
        {/* 독서 상태 */}
        <h3 className="mb-3 text-base font-bold">독서 상태</h3>
        <div className="-mx-5 mb-7 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {READING_STATUS_ORDER.map(status => {
            const meta = READING_STATUS_META[status]
            const isSelected = selected === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => setSelected(status)}
                disabled={isSaving}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-[124px] shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-4 transition-colors disabled:opacity-60',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/70 text-foreground hover:bg-primary/10'
                )}
              >
                <Icon name={meta.icon} className="mb-1 text-[26px]" />
                <span className="text-sm font-bold">{meta.label}</span>
                <span
                  className={cn(
                    'text-[11px]',
                    isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}
                >
                  {meta.description}
                </span>
              </button>
            )
          })}
        </div>

        {/* 독서 기간 */}
        <h3 className="mb-3 text-base font-bold">독서 기간</h3>
        <label htmlFor="library-started-at" className="mb-1.5 block text-sm text-muted-foreground">
          시작일
        </label>
        <input
          id="library-started-at"
          type="date"
          value={startedAt}
          onChange={e => setStartedAt(e.target.value)}
          disabled={isSaving}
          className="mb-7 w-full rounded-xl border border-border bg-card px-4 py-3.5 text-base outline-none transition-all focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />

        {/* 독서량 */}
        <h3 className="mb-3 text-base font-bold">독서량</h3>
        <div className="mb-2 flex items-stretch gap-2">
          {/* 스테퍼 — 브라우저 기본 화살표 대신 앱 톤에 맞춘 −/+ 버튼 */}
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center rounded-xl border border-border bg-card transition-opacity',
              (isSaving || isFinished) && 'opacity-60'
            )}
          >
            <button
              type="button"
              onClick={() => stepAmount(-1)}
              disabled={isSaving || isFinished}
              aria-label="독서량 줄이기"
              className="flex size-12 shrink-0 items-center justify-center rounded-l-xl text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none"
            >
              <Icon name="remove" className="text-xl" />
            </button>

            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxAmount ?? undefined}
              value={displayAmount}
              onChange={e => setAmount(e.target.value)}
              disabled={isSaving}
              readOnly={isFinished}
              placeholder={unit === 'page' ? '읽은 쪽수' : '읽은 비율'}
              aria-label={unit === 'page' ? '읽은 쪽수' : '읽은 비율(퍼센트)'}
              className="no-spinner min-w-0 flex-1 bg-transparent py-3.5 text-center text-base font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/40"
            />

            <button
              type="button"
              onClick={() => stepAmount(1)}
              disabled={isSaving || isFinished}
              aria-label="독서량 늘리기"
              className="flex size-12 shrink-0 items-center justify-center rounded-r-xl text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none"
            >
              <Icon name="add" className="text-xl" />
            </button>
          </div>

          <div className="flex shrink-0 overflow-hidden rounded-xl border border-border">
            {(['page', 'percent'] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setUnit(value)}
                // 쪽수를 모르는 완독 책은 퍼센트로만 100%를 표현할 수 있어 전환을 막는다.
                disabled={isSaving || (isFinished && totalPages == null)}
                aria-pressed={unit === value}
                className={cn(
                  'w-12 text-sm font-bold transition-colors disabled:opacity-60',
                  unit === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-primary/5'
                )}
              >
                {value === 'page' ? '쪽' : '%'}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-7 text-[11px] leading-5 text-muted-foreground/70">
          {isFinished
            ? '읽은 책은 끝까지 읽은 것으로 기록됩니다 · 이 기기에만 저장'
            : maxAmount != null
              ? `0에서 더 줄이면 ${maxAmount}${unit === 'page' ? '쪽' : '%'}으로 · 이 기기에만 저장`
              : '시작일과 독서량은 이 기기에만 저장됩니다'}
        </p>

        {saveError && (
          <p
            role="alert"
            aria-atomic="true"
            className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
          >
            {saveError}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? '저장 중...' : isEditing ? '수정하기' : '저장하기'}
        </button>

        <button
          onClick={() => {
            onClose()
            navigate(`/review/write/${bookId}`)
          }}
          disabled={isSaving}
          className="mt-4 w-full text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          감상 메모 남기기
        </button>
      </div>
    </BottomSheet>
  )
}
