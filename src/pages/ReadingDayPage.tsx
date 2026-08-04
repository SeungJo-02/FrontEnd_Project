import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import Icon from '@/components/common/Icon'
import { getMyLibrary, backendToFrontStatus, type LibraryBookSummary } from '@/api/library'
import { isDateKey, parseDateKey, toDateKey } from '@/lib/date'
import { getReadingProgress, toPercent } from '@/lib/readingProgressStore'

const LIBRARY_PAGE_SIZE = 100
const LIBRARY_MAX_PAGES = 10

/** 이 날짜에 이 책이 어떤 이유로 걸렸는지. 완독일이 시작일보다 우선한다. */
type DayKind = 'finished' | 'started'

interface DayEntry {
  book: LibraryBookSummary
  kind: DayKind
  /** 해당 이벤트의 시각(완독일/시작일). 목록 우측 시간 표기에 쓴다. */
  at: string
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hours = d.getHours()
  const meridiem = hours < 12 ? 'AM' : 'PM'
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${meridiem} ${displayHour}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 날짜별 독서 기록 페이지.
 *
 * 캘린더에서 날짜를 누르면 진입한다. 그 날 읽기 시작했거나 완독한 책을 상태별로 묶어
 * 보여준다.
 *
 * @remarks 백엔드에 "읽은 쪽수" 필드가 없어 진행률은 독서 상태에서 파생한다
 *          (완독 100%, 그 외는 진행 중 표시). 페이지 단위 진행률을 보여주려면
 *          서재 API에 현재 쪽수 필드가 필요하다.
 */
export default function ReadingDayPage() {
  const { date } = useParams()
  const [books, setBooks] = useState<LibraryBookSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isValidDate = date != null && isDateKey(date)

  useEffect(() => {
    if (!isValidDate) {
      setErrorMessage('날짜가 올바르지 않습니다.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const collected: LibraryBookSummary[] = []
        let cursor: number | null = null

        for (let page = 0; page < LIBRARY_MAX_PAGES; page++) {
          const response = await getMyLibrary({
            cursor,
            limit: LIBRARY_PAGE_SIZE,
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          collected.push(...response.content)
          if (!response.hasNext || response.nextCursor == null) break
          cursor = response.nextCursor
        }

        if (controller.signal.aborted) return
        setBooks(collected)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '독서 기록을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [isValidDate])

  const { reading, finished } = useMemo(() => {
    const readingList: DayEntry[] = []
    const finishedList: DayEntry[] = []
    if (!date) return { reading: readingList, finished: finishedList }

    for (const book of books) {
      const finishedOnThisDay = book.finishedAt && toDateKey(new Date(book.finishedAt)) === date
      const startedOnThisDay = book.startedAt && toDateKey(new Date(book.startedAt)) === date

      // 완독일이 우선. 같은 날 시작하고 끝냈어도 '완독한 책'으로만 센다.
      if (finishedOnThisDay) {
        finishedList.push({ book, kind: 'finished', at: book.finishedAt as string })
      } else if (startedOnThisDay) {
        readingList.push({ book, kind: 'started', at: book.startedAt as string })
      }
    }
    return { reading: readingList, finished: finishedList }
  }, [books, date])

  const headerTitle = useMemo(() => {
    const parsed = date ? parseDateKey(date) : null
    if (!parsed) return '독서 기록'
    return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`
  }, [date])

  const hasAny = reading.length > 0 || finished.length > 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title={headerTitle} showBack />

      <main className="flex-1 px-5 pb-24 pt-5">
        {isLoading && (
          <p
            role="status"
            aria-busy="true"
            className="py-16 text-center text-sm text-muted-foreground"
          >
            불러오는 중...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p role="alert" className="py-16 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && !hasAny && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Icon name="auto_stories" className="text-[64px] text-muted-foreground/25" />
            <p className="text-sm font-medium text-muted-foreground">
              이 날에는 독서 기록이 없어요.
            </p>
          </div>
        )}

        {!isLoading && !errorMessage && reading.length > 0 && (
          <DaySection title="읽고 있는 책" entries={reading} />
        )}

        {!isLoading && !errorMessage && finished.length > 0 && (
          <DaySection title="완독한 책" entries={finished} />
        )}
      </main>

      <BottomNav />
    </div>
  )
}

function DaySection({ title, entries }: { title: string; entries: DayEntry[] }) {
  return (
    <section className="mb-9">
      <h2 className="mb-4 text-base font-bold">
        {title} <span className="text-primary">({entries.length})</span>
      </h2>

      <ul className="space-y-6">
        {entries.map(entry => (
          <li key={`${entry.book.libraryBookId}-${entry.kind}`}>
            <DayBookRow entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function DayBookRow({ entry }: { entry: DayEntry }) {
  const { book, kind, at } = entry
  const isFinished = kind === 'finished'
  const frontStatus = backendToFrontStatus[book.status]

  // 완독이면 100%. 그 외에는 사용자가 상태 시트에서 입력해 둔 독서량으로 계산한다
  // (서버에 읽은 쪽수 필드가 없어 로컬 기록을 쓴다).
  const stored = getReadingProgress(book.book.bookId)
  const percent = isFinished ? 100 : toPercent(stored)
  const pageLabel =
    stored.unit === 'page' && stored.amount != null
      ? `${stored.amount}${stored.totalPages ? ` / ${stored.totalPages}` : ''}p`
      : null

  return (
    <div>
      <Link to={`/book/${book.book.bookId}`} className="flex gap-4">
        <div className="h-[120px] w-[88px] shrink-0 overflow-hidden rounded-md bg-primary/5 shadow-md">
          {book.book.coverImageUrl ? (
            <img
              src={book.book.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Icon name="menu_book" className="text-2xl text-primary/30" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h3 className="line-clamp-2 text-lg font-bold leading-tight">{book.book.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{book.book.author}</p>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                isFinished ? 'h-full rounded-full bg-primary' : 'h-full rounded-full bg-primary/60'
              }
              style={{ width: `${percent ?? 8}%` }}
            />
          </div>

          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-sm font-bold text-primary">
              {percent != null ? `${percent}%` : '읽는 중'}
            </span>
            {pageLabel && <span className="text-sm text-muted-foreground">{pageLabel}</span>}
          </div>
        </div>
      </Link>

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        {/* 완독은 '언제 끝냈는지'까지 알 필요가 없어 시각을 숨긴다(날짜는 페이지 제목에 있음) */}
        <span>{isFinished ? '' : formatTime(at)}</span>
        <span>{isFinished ? '완독' : frontStatus === 'stopped' ? '중단' : '읽기 시작'}</span>
      </div>
    </div>
  )
}
