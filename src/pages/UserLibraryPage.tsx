import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { cn } from '@/lib/utils'
import AppHeader from '@/components/layout/AppHeader'
import {
  getUserLibrary,
  backendToFrontStatus,
  type LibraryBookSummary,
  type LibraryVisibility,
  type ReadingStatus,
} from '@/api/library'
import { getUserProfile } from '@/api/member'
import { useAuthStore } from '@/store/authStore'

type FilterValue = ReadingStatus | 'all'

const filters: { label: string; value: FilterValue }[] = [
  { label: '전체', value: 'all' },
  { label: '읽고 싶은', value: 'want_to_read' },
  { label: '읽는 중', value: 'reading' },
  { label: '다 읽음', value: 'finished' },
  { label: '중단', value: 'stopped' },
]

const statusBadge: Record<ReadingStatus, { text: string; bg: string }> = {
  finished: { text: '다 읽음', bg: 'bg-primary' },
  reading: { text: '읽는 중', bg: 'bg-amber-600' },
  want_to_read: { text: '읽고 싶은', bg: 'bg-primary/40' },
  stopped: { text: '중단', bg: 'bg-slate-400' },
}

export default function UserLibraryPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const myUserId = useAuthStore(state => state.user?.id)

  const isValidId = /^\d+$/.test(userId ?? '')
  const numericUserId = isValidId ? parseInt(userId!, 10) : 0

  const [nickname, setNickname] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<LibraryVisibility | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [items, setItems] = useState<LibraryBookSummary[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)

  // observer 콜백에서 최신 state를 읽기 위한 ref (deps 폭주 방지)
  const stateRef = useRef({
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeFilter,
    loadMoreError,
    visibility,
  })
  stateRef.current = {
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeFilter,
    loadMoreError,
    visibility,
  }

  // 닉네임은 별도 호출로 가져옴 (직접 URL 진입에도 동작 보장).
  // 아래 서재 조회 effect와 병렬로 발생하며, 둘은 각자 AbortController로 cleanup된다.
  useEffect(() => {
    if (!isValidId) return
    // self-userId 진입 시 Navigate가 redirect하므로 불필요한 호출 방지
    if (myUserId && numericUserId === myUserId) return
    const controller = new AbortController()
    ;(async () => {
      try {
        const profile = await getUserProfile(numericUserId, controller.signal)
        if (controller.signal.aborted) return
        setNickname(profile.nickname)
      } catch {
        // 닉네임 조회 실패는 silent — 서재 조회 자체가 메인 경로
      }
    })()
    return () => controller.abort()
  }, [isValidId, numericUserId, myUserId])

  // 초기 로딩 + 필터 변경 시 재요청
  useEffect(() => {
    if (!isValidId) {
      setErrorMessage('잘못된 사용자 ID입니다.')
      setIsLoading(false)
      return
    }
    // self-userId 진입 시 Navigate가 redirect하므로 불필요한 호출 방지
    if (myUserId && numericUserId === myUserId) return

    setIsLoadingMore(false)
    setLoadMoreError(null)
    moreControllerRef.current?.abort()

    const controller = new AbortController()
    setItems([])
    setNextCursor(null)
    setHasNext(false)
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const response = await getUserLibrary({
          userId: numericUserId,
          status: activeFilter === 'all' ? undefined : activeFilter,
          cursor: null,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setVisibility(response.libraryVisibility)
        setItems(response.content)
        setNextCursor(response.nextCursor)
        setHasNext(response.hasNext)
      } catch (error) {
        // normalizeAxiosError가 cancel은 rethrow하므로 여기서 분기 필수
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '서재를 불러오지 못했습니다.')
        setItems([])
        setNextCursor(null)
        setHasNext(false)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      moreControllerRef.current?.abort()
    }
  }, [isValidId, numericUserId, activeFilter, myUserId])

  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext) return
    // PUBLIC 외에는 페이지네이션 호출 안 함 (백엔드도 빈 응답을 주지만 방어)
    if (s.visibility !== 'PUBLIC') return
    const requestedFilter = s.activeFilter
    const requestedCursor = s.nextCursor

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const response = await getUserLibrary({
        userId: numericUserId,
        status: requestedFilter === 'all' ? undefined : requestedFilter,
        cursor: requestedCursor,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      // 필터가 바뀌었다면 응답 버림 (stale guard)
      if (stateRef.current.activeFilter !== requestedFilter) return
      setItems(prev => [...prev, ...response.content])
      setNextCursor(response.nextCursor)
      setHasNext(response.hasNext)
    } catch (error) {
      // normalizeAxiosError가 cancel은 rethrow하므로 여기서 분기 필수
      if (axios.isCancel(error) || controller.signal.aborted) return
      // 필터가 바뀌었다면 에러도 버림 (stale guard)
      if (stateRef.current.activeFilter !== requestedFilter) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [numericUserId])

  // sentinel ref callback: 조건부 렌더된 sentinel 마운트/언마운트에 따라 observer 재부착이 자동
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      if (!node) {
        observerRef.current = null
        return
      }
      observerRef.current = new IntersectionObserver(
        entries => {
          if (!entries[0].isIntersecting) return
          if (stateRef.current.loadMoreError) return
          fetchMore()
        },
        { rootMargin: '200px' }
      )
      observerRef.current.observe(node)
    },
    [fetchMore]
  )

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const retryLoadMore = () => {
    setLoadMoreError(null)
    fetchMore()
  }

  // 자기 자신의 서재면 /library로 redirect (UserProfilePage와 동일 정책)
  if (myUserId && numericUserId === myUserId) {
    return <Navigate to="/library" replace />
  }

  // 미래에 PUBLIC 외 다른 enum이 추가되어도 비공개로 취급 (방어)
  const isPrivate = visibility != null && visibility !== 'PUBLIC'

  const headerTitle = nickname ? `${nickname}의 서재` : '서재'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title={headerTitle} showBack />

      {/* PRIVATE 분기: 필터/카운트/그리드 모두 숨기고 풀스크린 안내 */}
      {isPrivate ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-12">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-6xl text-muted-foreground/30"
          >
            lock
          </span>
          <h2 className="text-lg font-bold text-foreground">비공개 서재입니다</h2>
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            이 사용자가 서재를 공개하지 않았어요.
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            돌아가기
          </button>
        </main>
      ) : (
        <>
          {/* Filter Chips */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto p-4" role="tablist">
            {filters.map(filter => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={cn(
                  'shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors',
                  activeFilter === filter.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Book Count */}
          <div className="px-4 py-2">
            {!isLoading && !errorMessage && (
              <p className="text-sm font-medium">
                총 {items.length}권{hasNext ? '+' : ''}
              </p>
            )}
          </div>

          {/* Book Grid */}
          <main className="flex-1 overflow-y-auto px-4 pb-12">
            {isLoading && items.length === 0 && (
              <p
                role="status"
                aria-busy="true"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                불러오는 중...
              </p>
            )}

            {!isLoading && errorMessage && (
              <p role="alert" className="py-10 text-center text-sm text-destructive">
                {errorMessage}
              </p>
            )}

            {!isLoading && !errorMessage && items.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                  menu_book
                </span>
                <p className="text-sm text-muted-foreground">
                  {activeFilter === 'all'
                    ? '서재에 등록된 도서가 없어요.'
                    : '해당 상태의 도서가 없습니다'}
                </p>
              </div>
            )}

            {items.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {items.map(item => {
                    // 백엔드가 알 수 없는 enum 값을 반환해도 그리드 전체가 크래시하지 않도록 방어
                    const frontStatus: ReadingStatus | undefined = backendToFrontStatus[item.status]
                    const badge = frontStatus ? statusBadge[frontStatus] : null
                    return (
                      <Link
                        key={item.libraryBookId}
                        // 타 유저의 libraryBookId는 권한 외 — 도서 상세로 이동
                        to={`/book/${item.book.bookId}`}
                        className="relative flex flex-col gap-2"
                      >
                        <div className="group relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-primary/5 shadow-md">
                          {item.book.coverImageUrl ? (
                            <img
                              src={item.book.coverImageUrl}
                              alt={item.book.title}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center">
                              <span className="material-symbols-outlined text-3xl text-muted-foreground/30">
                                menu_book
                              </span>
                            </div>
                          )}
                          {badge && (
                            <div
                              className={cn(
                                'absolute bottom-1 right-1 rounded-full px-2 py-0.5 text-[10px] text-white',
                                badge.bg
                              )}
                            >
                              {badge.text}
                            </div>
                          )}
                          {item.hasReview && (
                            <div
                              role="img"
                              aria-label="감상 작성됨"
                              className="absolute left-1 top-1 rounded-full bg-background/90 p-1 text-primary shadow-sm"
                            >
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[14px]"
                              >
                                edit_note
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs font-semibold">{item.book.title}</p>
                      </Link>
                    )
                  })}
                </div>

                {/* 무한 스크롤 sentinel */}
                <div ref={sentinelRef} className="h-10" />

                {isLoadingMore && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    더 불러오는 중...
                  </p>
                )}

                {loadMoreError && !isLoadingMore && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p role="alert" className="text-sm text-destructive">
                      {loadMoreError}
                    </p>
                    <button
                      type="button"
                      onClick={retryLoadMore}
                      className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                    >
                      다시 불러오기
                    </button>
                  </div>
                )}

                {!hasNext && !isLoadingMore && !loadMoreError && (
                  <p className="py-4 text-center text-xs text-muted-foreground/50">
                    모든 도서를 확인했습니다
                  </p>
                )}
              </>
            )}
          </main>
        </>
      )}
    </div>
  )
}
