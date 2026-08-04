import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { LibraryBookSummary } from '@/api/library'
import Icon from '@/components/common/Icon'
import { toDateKey } from '@/lib/date'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

interface ReadingCalendarProps {
  books: LibraryBookSummary[]
  isLoading?: boolean
  errorMessage?: string | null
}

/**
 * 독서 캘린더. 서재 책의 시작일/완독일을 달력 칸에 표지 썸네일로 얹고,
 * 날짜를 누르면 그 날의 독서 기록 페이지로 이동한다.
 *
 * 별도 캘린더 API가 없어 `getMyLibrary` 응답(startedAt/finishedAt)에서 파생한다.
 */
export default function ReadingCalendar({
  books,
  isLoading = false,
  errorMessage = null,
}: ReadingCalendarProps) {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  /** 날짜키 → 그 날짜에 걸린 책들의 표지. 시작일과 완독일 모두를 표시한다. */
  const coversByDate = useMemo(() => {
    const map = new Map<string, { cover: string | null; count: number }>()
    const push = (dateKey: string, cover: string | null) => {
      const entry = map.get(dateKey)
      if (entry) {
        entry.count += 1
        if (!entry.cover) entry.cover = cover
      } else {
        map.set(dateKey, { cover, count: 1 })
      }
    }

    for (const item of books) {
      const cover = item.book.coverImageUrl
      const startKey = item.startedAt ? toDateKey(new Date(item.startedAt)) : null
      const finishKey = item.finishedAt ? toDateKey(new Date(item.finishedAt)) : null
      if (startKey) push(startKey, cover)
      // 같은 날 시작하고 끝냈으면 한 번만 센다.
      if (finishKey && finishKey !== startKey) push(finishKey, cover)
    }
    return map
  }, [books])

  const { cells, monthLabel } = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const leading = new Date(viewYear, viewMonth, 1).getDay()

    const result: (number | null)[] = Array.from({ length: leading }, () => null)
    for (let day = 1; day <= daysInMonth; day++) result.push(day)
    // 마지막 주를 7칸으로 채워 그리드가 어긋나지 않게 한다.
    while (result.length % 7 !== 0) result.push(null)

    return {
      cells: result,
      monthLabel: `${viewYear}.${String(viewMonth + 1).padStart(2, '0')}`,
    }
  }, [viewYear, viewMonth])

  const goToMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  return (
    <div>
      {/* 월 이동 */}
      <div className="mb-5 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          aria-label="이전 달"
          className="flex size-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
        >
          <Icon name="chevron_left" />
        </button>
        <h3 className="text-xl font-bold tracking-tight">{monthLabel}</h3>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          aria-label="다음 달"
          className="flex size-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
        >
          <Icon name="chevron_right" />
        </button>
      </div>

      {isLoading && (
        <p role="status" className="py-10 text-center text-sm text-muted-foreground">
          독서 기록을 불러오는 중...
        </p>
      )}

      {!isLoading && errorMessage && (
        <p role="alert" className="py-10 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {!isLoading && !errorMessage && (
        <div className="grid grid-cols-7 gap-x-1 gap-y-3">
          {WEEKDAYS.map(day => (
            <div key={day} className="pb-1 text-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}

          {cells.map((day, index) => {
            if (day == null) return <div key={`blank-${index}`} aria-hidden="true" />

            const dateKey = toDateKey(new Date(viewYear, viewMonth, day))
            const entry = coversByDate.get(dateKey)
            const isToday = dateKey === toDateKey(today)

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => navigate(`/library/day/${dateKey}`)}
                aria-label={`${viewMonth + 1}월 ${day}일${entry ? `, 책 ${entry.count}권` : ''} 독서 기록 보기`}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className={cn(
                    'relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-muted/60 transition-all',
                    entry && 'ring-1 ring-primary/20'
                  )}
                >
                  {entry?.cover ? (
                    <img
                      src={entry.cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : entry ? (
                    <Icon name="menu_book" className="text-[18px] text-primary/50" />
                  ) : null}

                  {entry && entry.count > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {entry.count}
                    </span>
                  )}
                </div>

                <span
                  className={cn(
                    'text-xs',
                    isToday ? 'font-bold text-primary' : 'text-muted-foreground'
                  )}
                >
                  {day}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
