import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { cn } from '@/lib/utils'
import BottomNav from '@/components/layout/BottomNav'
import { EmptyState } from '@/components/common/EmptyState'
import {
  getMyLibrary,
  backendToFrontStatus,
  type LibraryBookSummary,
  type ReadingStatus,
} from '@/api/library'
import {
  LIBRARY_FILTERS as filters,
  LIBRARY_STATUS_BADGE as statusBadge,
  type LibraryFilterValue as FilterValue,
} from '@/constants/library'

export default function MyLibraryPage() {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [items, setItems] = useState<LibraryBookSummary[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  /**
   * 서재 내 검색 입력창 표시 여부와 검색어.
   *
   * 헤더 돋보기 클릭 시 입력창이 헤더 아래 토글된다. 검색어가 있으면 현재 로드된
   * `items`를 클라이언트 측에서 `book.title`/`book.author` 부분 일치(대소문자 무시)로
   * 필터링한다.
   *
   * @remarks 한계 — 서버 페이징을 다 가져오기 전에는 검색이 현재까지 로드된 항목
   * 내에서만 동작한다. 정식 검색은 백엔드에 query 파라미터를 추가하는 별도 이슈에서
   * 처리한다.
   */
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  /**
   * 활성 필터 칩 노드들. 활성 칩이 시야 밖이면 가운데로 자동 스크롤하여
   * "잘려서 안 보임" 문제를 해결한다.
   *
   * [code-review MED fix] 키를 `FilterValue`로 좁혀 enum 추가/제거 시 컴파일러가 추적.
   */
  const filterChipRefs = useRef<Partial<Record<FilterValue, HTMLButtonElement | null>>>({})
  /**
   * 검색 입력 DOM ref. autoFocus 대신 명시적 focus()로 a11y 룰(no-autofocus)과의
   * 충돌을 피하면서 동일 UX를 보장.
   */
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // observer 콜백에서 최신 state를 읽기 위한 ref (deps 폭주 방지)
  const stateRef = useRef({
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeFilter,
    loadMoreError,
  })
  stateRef.current = {
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeFilter,
    loadMoreError,
  }

  // 초기 로딩 + 필터 변경 시 재요청
  useEffect(() => {
    setIsLoadingMore(false)
    setLoadMoreError(null)
    moreControllerRef.current?.abort()

    const controller = new AbortController()
    // 이전 필터의 목록을 즉시 비워 로딩 표시(isLoading && items.length === 0)를 노출한다.
    // 그렇지 않으면 필터 전환 시 구 데이터가 새 응답 도착까지 그대로 보여 UX가 혼란스럽다.
    setItems([])
    setNextCursor(null)
    setHasNext(false)
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const response = await getMyLibrary({
          status: activeFilter === 'all' ? undefined : activeFilter,
          cursor: null,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
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
  }, [activeFilter])

  // 다음 페이지 로딩 (observer + 수동 retry에서 공유)
  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext) return
    const requestedFilter = s.activeFilter
    const requestedCursor = s.nextCursor

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const response = await getMyLibrary({
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
  }, [])

  // sentinel ref callback: 조건부 렌더된 sentinel 마운트/언마운트에 따라 observer 재부착이 자동으로 된다.
  // (useEffect + hasItems deps 조합보다 렌더 순서에 견고)
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

  // 필터 변경 시 활성 칩이 시야 밖이면 가운데로 자동 스크롤. "중단"이 잘려서 안 보이는
  // 문제와 모바일 좁은 화면에서 활성 칩이 시야 밖에 있을 때 모두 커버.
  useEffect(() => {
    const node = filterChipRefs.current[activeFilter]
    node?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeFilter])

  // 검색 입력창이 열릴 때마다 명시적으로 focus. autoFocus 대신 useRef + .focus() 패턴
  // 사용 — eslint jsx-a11y/no-autofocus 룰과의 충돌 방지 및 SSR 환경에서도 동작 보장.
  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  const retryLoadMore = () => {
    setLoadMoreError(null)
    fetchMore()
  }

  /**
   * 검색어 적용 결과. 빈 문자열이면 원본 그대로, 아니면 title/author 부분 일치 필터링.
   *
   * 입력 정규화: 양끝 공백 제거 후 소문자 비교. 클라이언트 측이라 추가 API 호출 없음.
   */
  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => {
      const title = item.book.title?.toLowerCase() ?? ''
      const author = item.book.author?.toLowerCase() ?? ''
      return title.includes(q) || author.includes(q)
    })
  }, [items, searchQuery])

  const isSearching = searchQuery.trim().length > 0

  /**
   * 검색 입력창 토글 핸들러. 닫을 때는 검색어를 함께 초기화하여 사용자가 같은
   * 검색어로 화면이 필터된 상태로 다시 들어오는 혼란을 막는다.
   */
  const toggleSearch = () => {
    if (isSearchOpen) {
      setIsSearchOpen(false)
      setSearchQuery('')
    } else {
      setIsSearchOpen(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="w-10" />
          <h1 className="text-2xl font-bold">내 서재</h1>
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={isSearchOpen ? '서재 검색 닫기' : '서재 내 검색'}
            aria-expanded={isSearchOpen}
            className="flex w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined text-primary">
              {isSearchOpen ? 'close' : 'search'}
            </span>
          </button>
        </div>
        {isSearchOpen && (
          <div className="px-4 pb-3">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="서재에서 제목·저자 검색"
              aria-label="서재 내 검색어"
              className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        )}
      </header>

      {/* Filter Chips — 우측 페이드로 가로 스크롤 가능함을 시각적으로 암시 + 활성 칩 자동 가운데 정렬 */}
      <div className="relative">
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-4" role="tablist">
          {filters.map(filter => (
            <button
              key={filter.value}
              ref={node => {
                filterChipRefs.current[filter.value] = node
              }}
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        />
      </div>

      {/* Book Count — 검색 중엔 검색 결과 수 표시, 일반 시엔 전체 권수.
          [code-review HIGH fix] 검색 결과도 hasNext일 때 "+"를 붙여 추가 페이지 매치 가능성을 명시. */}
      <div className="px-4 py-2">
        {!isLoading && !errorMessage && (
          <p className="text-sm font-medium">
            {isSearching
              ? `검색 결과 ${visibleItems.length}권${hasNext ? '+' : ''}`
              : `총 ${items.length}권${hasNext ? '+' : ''}`}
          </p>
        )}
      </div>

      {/* Book Grid */}
      <main className="flex-1 overflow-y-auto px-4 pb-24">
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
          <EmptyState
            icon="menu_book"
            message={
              activeFilter === 'all'
                ? '서재가 비어있습니다. 책을 검색해서 추가해보세요.'
                : '해당 상태의 도서가 없습니다'
            }
          />
        )}

        {/* 검색 중인데 결과 0건일 때의 빈 상태 — items는 있지만 visibleItems만 비었을 때.
            sentinel은 visibleItems 분기 안에 있어 자동 페이징이 멈추므로,
            아직 로드 안 된 페이지가 남았다면(hasNext) 명시적 "더 불러오기" 버튼 제공. */}
        {!isLoading && !errorMessage && items.length > 0 && visibleItems.length === 0 && (
          <EmptyState
            icon="search_off"
            message={<>&lsquo;{searchQuery}&rsquo;에 해당하는 도서가 없습니다</>}
          >
            {hasNext && (
              <>
                <p className="text-xs text-muted-foreground/70">
                  추가로 로드되지 않은 도서가 있을 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={fetchMore}
                  disabled={isLoadingMore}
                  className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                >
                  {/* [code-review MED fix] 1회 클릭 = 1페이지 단위임을 사용자에게 명시 */}
                  {isLoadingMore ? '불러오는 중...' : '다음 페이지 불러오기'}
                </button>
              </>
            )}
          </EmptyState>
        )}

        {visibleItems.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4">
              {visibleItems.map(item => {
                // 백엔드가 알 수 없는 enum 값을 반환해도 그리드 전체가 크래시하지 않도록 방어
                const frontStatus: ReadingStatus | undefined = backendToFrontStatus[item.status]
                const badge = frontStatus ? statusBadge[frontStatus] : null
                return (
                  <Link
                    key={item.libraryBookId}
                    to={`/library/${item.libraryBookId}`}
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
              <p className="py-4 text-center text-xs text-muted-foreground">더 불러오는 중...</p>
            )}

            {!hasNext && !isLoadingMore && !loadMoreError && (
              <p className="py-4 text-center text-xs text-muted-foreground/50">
                모든 도서를 확인했습니다
              </p>
            )}
          </>
        )}

        {/* [CodeRabbit fix] loadMoreError + 재시도는 그리드(visibleItems > 0)와 검색 빈 결과
            분기 양쪽에서 모두 보여야 한다. 검색 빈 결과 상태에서 "다음 페이지 불러오기"가 실패해도
            사용자가 원인을 알 수 있도록 conditional 밖으로 hoist. items가 0건일 땐 errorMessage
            분기로 가므로 items.length > 0 가드만 추가. */}
        {items.length > 0 && loadMoreError && !isLoadingMore && (
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
      </main>

      <BottomNav />
    </div>
  )
}
