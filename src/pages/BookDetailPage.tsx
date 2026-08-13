import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { cn } from '@/lib/utils'
import BookMemoTab from '@/components/book/BookMemoTab'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import StarRating from '@/components/common/StarRating'
import AddToLibrarySheet from '@/components/common/AddToLibrarySheet'
import {
  getBook,
  getBookReviews,
  type BookDetail,
  type BookReviewItem,
  type BackendReadingStatus,
} from '@/api/book'
import {
  addLibraryBook,
  updateLibraryBookStatus,
  removeLibraryBook,
  getLibraryBookDetail,
  backendToFrontStatus,
  type ReadingStatus,
} from '@/api/library'
import { READING_STATUS_META } from '@/constants/library'
import { formatRelativeTime } from '@/lib/utils'
import { shareLink } from '@/lib/share'
import { Avatar } from '@/components/common/Avatar'
import { Screen, ScreenBody } from '@/components/layout/Screen'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import Icon from '@/components/common/Icon'

// toFrontStatus 유지 이유: getBook 응답의 myLibraryStatus는 string | null 타입(백엔드 Nullable)으로 내려오므로
// 방어적 null 변환이 필요하다. 매핑 자체는 @/api/library의 backendToFrontStatus(단일 출처, Partial)를 재사용한다.
// Partial이라 미지의 enum 값은 undefined가 되므로 ?? null로 흡수한다.
function toFrontStatus(s: string | null): ReadingStatus | null {
  if (!s) return null
  return backendToFrontStatus[s as BackendReadingStatus] ?? null
}

const TABS = [
  { value: 'info', label: '책 정보' },
  { value: 'review', label: '리뷰' },
  { value: 'memo', label: '메모' },
] as const

type TabValue = (typeof TABS)[number]['value']

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 시작~종료를 포함 일수로 계산한다(같은 날이면 1일). 둘 중 하나라도 없으면 null. */
function readingDays(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null
  const start = new Date(startedAt)
  const end = new Date(finishedAt)
  const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)
  if (Number.isNaN(ms) || ms < 0) return null
  return Math.floor(ms / 86_400_000) + 1
}

/** 도서 정보 한 줄. 값이 길면 라벨 오른쪽에서 좌측 정렬로 자연스럽게 줄바꿈된다. */
function BookInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-keep font-medium leading-6">{value}</dd>
    </div>
  )
}

export default function BookDetailPage() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [book, setBook] = useState<BookDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedStatus, setSavedStatus] = useState<ReadingStatus | null>(null)
  const [previewReviews, setPreviewReviews] = useState<BookReviewItem[]>([])
  /** 독서 기간(시작/종료). 서재에 담긴 책일 때만 채워진다. */
  const [readingPeriod, setReadingPeriod] = useState<{
    startedAt: string | null
    finishedAt: string | null
  } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  // 메모 작성 후 `?tab=memo`로 돌아오므로 초기 탭을 쿼리에서 읽는다.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: TabValue = TABS.some(t => t.value === tabParam) ? (tabParam as TabValue) : 'info'
  const setActiveTab = (tab: TabValue) => {
    setSearchParams(tab === 'info' ? {} : { tab }, { replace: true })
  }

  // StrictMode dev 모드에서 effect가 mount → unmount → mount로 더블 인보크되므로
  // setup에서 명시적으로 true로 리셋해 ref가 false로 stuck되지 않도록 한다.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const parsedBookId = bookId ? Number(bookId) : NaN
  const isValidBookId = Number.isInteger(parsedBookId) && parsedBookId > 0

  useEffect(() => {
    if (!isValidBookId) {
      setIsLoading(false)
      setErrorMessage('유효하지 않은 도서 ID입니다.')
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setPreviewReviews([])
    setReadingPeriod(null)
    ;(async () => {
      try {
        const [result, reviewResult] = await Promise.all([
          getBook(parsedBookId, controller.signal),
          getBookReviews(parsedBookId, { limit: 3, signal: controller.signal }).catch(() => null),
        ])
        if (controller.signal.aborted) return
        setBook(result)
        setSavedStatus(toFrontStatus(result.myLibraryStatus))
        if (reviewResult) setPreviewReviews(reviewResult.content)

        // 독서 기간은 서재 상세에만 있어 별도 조회한다. 실패해도 페이지는 그대로 뜬다.
        if (result.myLibraryBookId != null) {
          try {
            const detail = await getLibraryBookDetail(result.myLibraryBookId, controller.signal)
            if (controller.signal.aborted) return
            setReadingPeriod({ startedAt: detail.startedAt, finishedAt: detail.finishedAt })
          } catch {
            // 독서 기간 미표시는 치명적이지 않다.
          }
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '도서 정보를 불러오지 못했습니다.')
        setBook(null)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [parsedBookId, isValidBookId])

  if (isLoading) {
    return (
      <Screen>
        <AppHeader title="Shelfeed" showBack />
        <ScreenBody centered aria-busy="true">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </ScreenBody>
        <BottomNav />
      </Screen>
    )
  }

  if (errorMessage || !book) {
    return (
      <Screen>
        <AppHeader title="Shelfeed" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <Icon name="search_off" className="text-6xl text-muted-foreground/30" />
          <p role="alert" className="text-lg font-bold text-muted-foreground">
            {errorMessage ?? '도서를 찾을 수 없습니다'}
          </p>
          <Button onClick={() => navigate(-1)}>돌아가기</Button>
        </main>
        <BottomNav />
      </Screen>
    )
  }

  // 완독 상태가 아니면 종료일은 의미가 없다(백엔드가 상태 되돌림 시 finishedAt을 비우지 않음).
  const showFinished = savedStatus === 'finished' && readingPeriod?.finishedAt != null

  const handleReviewClick = () => {
    if (book.myReviewId != null) {
      navigate(`/review/${book.myReviewId}`)
      return
    }
    // 서재에 담긴 책이면 서재책 ID를 함께 넘겨 백엔드가 감상을 그 서재책과 연결하게 한다.
    navigate(`/review/write/${book.bookId}`, {
      state: book.myLibraryBookId != null ? { libraryBookId: book.myLibraryBookId } : undefined,
    })
  }

  const handleRemoveFromLibrary = async () => {
    if (book.myLibraryBookId == null || isRemoving) return
    if (!window.confirm('이 책을 서재에서 빼시겠습니까? 작성한 감상은 그대로 남습니다.')) return

    setIsRemoving(true)
    setRemoveErrorMessage(null)
    try {
      await removeLibraryBook(book.myLibraryBookId)
      if (!isMountedRef.current) return
      setSavedStatus(null)
      setReadingPeriod(null)
      setBook(prev => (prev ? { ...prev, myLibraryBookId: null, myLibraryStatus: null } : prev))
    } catch (error) {
      if (!isMountedRef.current) return
      setRemoveErrorMessage(
        error instanceof Error ? error.message : '서재에서 제거하지 못했습니다.'
      )
    } finally {
      if (isMountedRef.current) setIsRemoving(false)
    }
  }

  const handleSaveLibraryStatus = async (status: ReadingStatus) => {
    if (book.myLibraryBookId != null) {
      // 이미 서재에 있는 도서 → PATCH로 상태만 변경
      const result = await updateLibraryBookStatus(book.myLibraryBookId, status)
      if (!isMountedRef.current) return
      // unknown enum 응답이면 사용자가 방금 선택한 status를 fallback으로 유지 (CTA가 "내 서재에 추가"로 회귀하는 오해 방지)
      const nextStatus = toFrontStatus(result.status) ?? status
      setSavedStatus(nextStatus)
      setReadingPeriod({
        startedAt: result.startedAt,
        // 완독이 아닌 상태로 바꿨는데 백엔드가 finishedAt을 그대로 돌려주는 경우가 있어 여기서 비운다.
        finishedAt: nextStatus === 'finished' ? result.finishedAt : null,
      })
      return
    }
    // 신규 추가 → POST. 응답의 libraryBookId를 로컬 book 상태에 반영해 다음 수정이 PATCH로 가도록 한다.
    const result = await addLibraryBook(book.bookId, status)
    if (!isMountedRef.current) return
    if ('alreadyExists' in result) {
      setSavedStatus(status)
      return
    }
    const nextStatus = toFrontStatus(result.status) ?? status
    setSavedStatus(nextStatus)
    setReadingPeriod({
      startedAt: result.startedAt,
      finishedAt: nextStatus === 'finished' ? result.finishedAt : null,
    })
    setBook(prev => (prev ? { ...prev, myLibraryBookId: result.libraryBookId } : prev))
  }

  const handleShare = async () => {
    if (!book) return
    const result = await shareLink({
      title: book.title,
      text: `${book.title} - ${book.author}`,
      path: `/book/${book.bookId}`,
    })
    if (result === 'copied') alert('링크가 복사되었습니다.')
    else if (result === 'failed') alert('공유에 실패했습니다.')
  }

  return (
    <Screen>
      <AppHeader
        title="Shelfeed"
        showBack
        rightAction={
          <IconButton onClick={handleShare} aria-label="공유">
            <Icon name="share" />
          </IconButton>
        }
      />

      <ScreenBody>
        {/* Hero — 제목 · 표지 · 저자 · 별점 · 독서 상태 */}
        <section className="px-6 pt-6 text-center">
          <h1 className="mb-4 text-2xl font-bold leading-tight">{book.title}</h1>

          <div className="mx-auto aspect-[2/3] w-1/2 overflow-hidden rounded-md border border-primary/5 shadow-2xl">
            {book.coverImageUrl ? (
              <img
                loading="lazy"
                src={book.coverImageUrl}
                alt={book.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-primary/5">
                <Icon name="menu_book" className="text-5xl text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* 저자가 여럿이면 여러 줄이 된다 — break-keep으로 단어 중간에서 끊기지 않게 한다 */}
          <p className="mt-4 break-keep px-2 text-sm leading-6 text-muted-foreground">
            {book.author}
          </p>

          <div className="mt-2 flex justify-center">
            <StarRating rating={book.averageRating ?? 0} size="md" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {book.averageRating != null ? `${book.averageRating.toFixed(1)} / 5.0 · ` : ''}
            {book.reviewCount != null
              ? `${book.reviewCount.toLocaleString()}개의 감상`
              : '아직 감상이 없습니다'}
          </p>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={savedStatus ? '내 서재 상태 수정' : '내 서재에 추가'}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
          >
            <Icon
              name={savedStatus ? READING_STATUS_META[savedStatus].icon : 'library_add'}
              className="text-[18px]"
            />
            {savedStatus ? READING_STATUS_META[savedStatus].label : '내 서재에 추가'}
          </button>

          {savedStatus && (
            <div>
              <button
                type="button"
                onClick={handleRemoveFromLibrary}
                disabled={isRemoving}
                className="mt-3 text-xs font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive disabled:opacity-60"
              >
                {isRemoving ? '제거 중...' : '서재에서 빼기'}
              </button>
              {removeErrorMessage && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {removeErrorMessage}
                </p>
              )}
            </div>
          )}
        </section>

        {/* 독서 기간 — 서재에 담긴 책만 */}
        {readingPeriod && (
          <section className="mt-8 px-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">독서 기간</h2>
              {(() => {
                // 완독 상태일 때만 소요 일수를 말할 수 있다. 다 읽음 → 읽는 중으로 되돌리면
                // 백엔드가 finishedAt을 비워주지 않는 이슈가 있어 표시단에서 상태로 가른다.
                const days = showFinished
                  ? readingDays(readingPeriod.startedAt, readingPeriod.finishedAt)
                  : null
                if (days == null) return null
                return (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {String(days)
                      .padStart(3, '0')
                      .split('')
                      .map((digit, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-1.5 py-0.5 font-bold text-foreground"
                        >
                          {digit}
                        </span>
                      ))}
                    일 동안 읽었어요
                  </p>
                )
              })()}
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-primary">시작</span>
                <span className="text-sm">{formatDate(readingPeriod.startedAt)}</span>
              </div>
              {showFinished && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">종료</span>
                  <span className="text-sm">{formatDate(readingPeriod.finishedAt)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 탭 */}
        <div className="mt-8 border-b border-border px-6">
          <div role="tablist" aria-label="도서 상세 탭" className="flex">
            {TABS.map(tab => {
              const isActive = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`book-tabpanel-${tab.value}`}
                  id={`book-tab-${tab.value}`}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'flex-1 border-b-2 pb-3 text-center text-md transition-colors',
                    isActive
                      ? 'border-primary font-bold text-foreground'
                      : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          id={`book-tabpanel-${activeTab}`}
          aria-labelledby={`book-tab-${activeTab}`}
          className="px-6 pt-6"
        >
          {activeTab === 'info' && (
            <section>
              {/* 소개가 없으면 빈 문구 대신 등록된 도서 정보만 보여준다 */}
              {book.description && (
                <>
                  <h3 className="mb-3 text-lg font-bold">책 소개</h3>
                  <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {book.description}
                  </p>
                </>
              )}

              <h3 className="mb-3 text-lg font-bold">도서 정보</h3>
              {/*
                라벨 고정폭 + 값 좌측 정렬. 예전엔 값을 우측 정렬했는데, 저자가 여럿인 책
                ("A, B (지은이), C (옮긴이)")에서 줄바꿈되면 두 번째 줄이 오른쪽에 붙어
                읽는 순서가 끊겼다. 좌측 정렬이면 여러 줄이어도 시선이 한 줄로 이어진다.
              */}
              <dl className="space-y-2.5 rounded-2xl bg-card p-4 text-sm shadow-sm">
                <BookInfoRow label="저자" value={book.author} />
                <BookInfoRow label="출판사" value={book.publisher} />
                {book.publishedDate && <BookInfoRow label="출간일" value={book.publishedDate} />}
                {book.totalPages != null && book.totalPages > 0 && (
                  <BookInfoRow label="쪽수" value={`${book.totalPages}쪽`} />
                )}
                <BookInfoRow label="ISBN" value={book.isbn13} />
              </dl>
            </section>
          )}

          {activeTab === 'review' && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">독자들의 감상</h3>
                <Link
                  to={`/book/${book.bookId}/reviews`}
                  className="text-sm font-semibold text-primary"
                >
                  전체보기
                </Link>
              </div>

              {previewReviews.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/10 py-10 text-center">
                  <Icon name="rate_review" className="text-3xl text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">아직 감상이 없습니다</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {previewReviews.map(review => (
                    <Link
                      key={review.reviewId}
                      to={`/review/${review.reviewId}`}
                      className="rounded-xl bg-card p-4 shadow-sm transition-colors hover:bg-primary/5"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            src={review.user.profileImageUrl}
                            alt={review.user.nickname}
                            className="size-7"
                            iconClassName="text-[14px]"
                          />
                          <span className="text-sm font-bold">{review.user.nickname}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(review.createdAt)}
                          </span>
                        </div>
                        <StarRating rating={review.rating} size="sm" />
                      </div>
                      {review.isSpoiler ? (
                        <p className="line-clamp-2 text-sm italic text-muted-foreground">
                          스포일러 포함 — 전체보기에서 확인하세요
                        </p>
                      ) : (
                        <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
                          {review.content}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        {review.likeCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Icon name="favorite" className="text-[14px]" />
                            {review.likeCount}
                          </span>
                        )}
                        {review.commentCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Icon name="chat_bubble" className="text-[14px]" />
                            {review.commentCount}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleReviewClick}
                className="mt-5 w-full rounded-xl border border-primary/20 bg-card py-4 text-base font-semibold text-primary transition-colors hover:bg-primary/5"
              >
                {book.myReviewId != null ? '내 감상 보기' : '감상 쓰기'}
              </button>
            </section>
          )}

          {activeTab === 'memo' && <BookMemoTab bookId={book.bookId} />}
        </div>
      </ScreenBody>

      <AddToLibrarySheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSaveLibraryStatus}
        bookId={String(book.bookId)}
        defaultStatus={savedStatus ?? undefined}
        totalPages={book.totalPages}
        serverStartedAt={readingPeriod?.startedAt ?? null}
      />

      <BottomNav />
    </Screen>
  )
}
