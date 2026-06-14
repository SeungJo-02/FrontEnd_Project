import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import UserSearchCard from '@/components/common/UserSearchCard'
import { getBookByIsbn, searchBooks, type BookDetail, type BookSummary } from '@/api/book'
import { searchAll, type BookSearchItem, type UserSearchItem, type SearchType } from '@/api/search'
import { cn } from '@/lib/utils'
import { useSearchStore, RECENT_KEYWORDS_KEY } from '@/store/searchStore'
const MAX_RECENT_KEYWORDS = 10
const ALL_TAB_PREVIEW_COUNT = 5

// ZXing 의존성을 가진 모달은 사용자가 카메라 버튼을 눌렀을 때만 다운로드
const IsbnScannerModal = lazy(() => import('@/components/common/IsbnScannerModal'))

const ISBN13_REGEX = /^97[89]\d{10}$/

// EAN-13 체크섬: 1*d0 + 3*d1 + 1*d2 + 3*d3 ... + d12 = 0 (mod 10)
function isValidIsbn13(value: string): boolean {
  if (!ISBN13_REGEX.test(value)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) {
    const digit = Number(value[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return sum % 10 === 0
}

// 도서 상세(BookDetail)를 검색 결과 카드(BookSummary)와 시각적으로 통일
function isbnResultToSummary(book: BookDetail): BookSummary {
  return {
    bookId: book.bookId,
    isbn13: book.isbn13,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    coverImageUrl: book.coverImageUrl,
    publishedDate: book.publishedDate,
    inMyLibrary: book.inMyLibrary ?? false,
  }
}

function loadRecentKeywords(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEYWORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string').slice(0, MAX_RECENT_KEYWORDS)
      : []
  } catch {
    return []
  }
}

function saveRecentKeywords(keywords: string[]) {
  try {
    localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(keywords))
  } catch {
    // localStorage 쓰기 실패 시 무시 (private 모드, 용량 초과 등)
  }
}

const TABS: { value: SearchType; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'book', label: '도서' },
  { value: 'user', label: '유저' },
]

function isSearchType(value: string | null): value is SearchType {
  return value === 'all' || value === 'book' || value === 'user'
}

/**
 * 통합 검색 페이지 (`/search`).
 *
 * 탭(전체/도서/유저)으로 분기하여 단일 진입점에서 도서와 유저를 모두 검색한다.
 * URL 쿼리 `?tab=...&q=...`로 deep link/새로고침 보존.
 *
 * **API 분리 정책**:
 * - 도서 탭: 기존 `searchBooks` (`/api/v1/books/search`) 그대로 — `publisher`/`publishedDate`/
 *   `inMyLibrary`(서재 상태) + ISBN 자동 인식 + 바코드 스캐너 동작 유지.
 * - 유저 탭 / 전체 탭: 통합 검색 `searchAll` (`/api/v1/search`) — 응답에 `averageRating`/
 *   `reviewCount`(통계)는 있지만 publisher/inMyLibrary는 없음. 카드 UI 분리.
 *
 * **무한 스크롤**:
 * - 도서 탭과 유저 탭 모두 IntersectionObserver + cursor 페이징.
 * - 전체 탭은 books/users를 각각 처음 `ALL_TAB_PREVIEW_COUNT`건만 미리보기로 노출하고
 *   "전체 보기" 클릭 시 해당 탭으로 점프 (페이징 없음).
 *
 * **state 분리**:
 * 탭별 결과/cursor/로딩/에러를 별도 state로 둬서 탭 전환 시 다른 탭의 결과를 보존.
 * 검색어/탭 변경 시 in-flight 요청은 AbortController로 일괄 abort.
 */
export default function BookSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [recentKeywords, setRecentKeywords] = useState<string[]>(() => loadRecentKeywords())

  const cached = useRef(useSearchStore.getState()).current
  const urlQuery = searchParams.get('q')
  const urlTabRaw = searchParams.get('tab')
  const urlTab = isSearchType(urlTabRaw) ? urlTabRaw : null
  const hasUrlParams = urlQuery !== null || urlTab !== null
  const hasCache = cached.query.length > 0
  const restoredFromCache = useRef(hasCache && !hasUrlParams)

  const initialQuery = urlQuery ?? (hasCache ? cached.query : '')
  const initialTab: SearchType = urlTab ?? (hasCache ? cached.activeTab : 'all')

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [activeTab, setActiveTab] = useState<SearchType>(initialTab)
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  // 도서 탭 (searchBooks 응답) — 백엔드가 page 기반 페이지네이션으로 변경됨
  const [bookResults, setBookResults] = useState<BookSummary[]>(cached.bookResults)
  const [bookNextPage, setBookNextPage] = useState<number | null>(cached.bookNextPage)
  const [bookHasNext, setBookHasNext] = useState(cached.bookHasNext)
  const [isBookLoading, setIsBookLoading] = useState(false)
  const [isBookLoadingMore, setIsBookLoadingMore] = useState(false)
  const [bookErrorMessage, setBookErrorMessage] = useState<string | null>(null)
  const [bookLoadMoreError, setBookLoadMoreError] = useState<string | null>(null)

  // 유저 탭 (searchAll type=user 응답)
  const [userResults, setUserResults] = useState<UserSearchItem[]>(cached.userResults)
  const [userNextCursor, setUserNextCursor] = useState<number | null>(cached.userNextCursor)
  const [userHasNext, setUserHasNext] = useState(cached.userHasNext)
  const [isUserLoading, setIsUserLoading] = useState(false)
  const [isUserLoadingMore, setIsUserLoadingMore] = useState(false)
  const [userErrorMessage, setUserErrorMessage] = useState<string | null>(null)
  const [userLoadMoreError, setUserLoadMoreError] = useState<string | null>(null)

  // 전체 탭 (searchAll type=all 응답 — 미리보기용, 페이징 없음)
  const [allBooks, setAllBooks] = useState<BookSearchItem[]>(cached.allBooks)
  const [allUsers, setAllUsers] = useState<UserSearchItem[]>(cached.allUsers)
  const [allBooksHasMore, setAllBooksHasMore] = useState(cached.allBooksHasMore)
  const [allUsersHasMore, setAllUsersHasMore] = useState(cached.allUsersHasMore)
  const [isAllLoading, setIsAllLoading] = useState(false)
  const [allErrorMessage, setAllErrorMessage] = useState<string | null>(null)

  const trimmedQuery = searchQuery.trim()
  const isIsbnMode = isValidIsbn13(trimmedQuery)

  const bookSentinelRef = useRef<HTMLDivElement | null>(null)
  const userSentinelRef = useRef<HTMLDivElement | null>(null)

  /**
   * 탭별 진행 중 요청 abort controller. 검색어/탭 전환 시 새 요청으로 교체.
   */
  const bookMoreControllerRef = useRef<AbortController | null>(null)
  const userMoreControllerRef = useRef<AbortController | null>(null)

  // Effect 2(state→URL)가 직접 URL을 바꿀 때 세우는 플래그.
  // Effect 1(URL→state)은 이 플래그가 서있으면 setState를 건너뛰어 양방향 루프를 차단한다.
  const isInternalNavRef = useRef(false)

  // observer 콜백에서 최신 state를 읽기 위한 ref (deps 폭주 방지)
  const stateRef = useRef({
    bookHasNext,
    isBookLoading,
    isBookLoadingMore,
    bookNextPage,
    bookLoadMoreError,
    userHasNext,
    isUserLoading,
    isUserLoadingMore,
    userNextCursor,
    userLoadMoreError,
    trimmedQuery,
    activeTab,
  })
  stateRef.current = {
    bookHasNext,
    isBookLoading,
    isBookLoadingMore,
    bookNextPage,
    bookLoadMoreError,
    userHasNext,
    isUserLoading,
    isUserLoadingMore,
    userNextCursor,
    userLoadMoreError,
    trimmedQuery,
    activeTab,
  }

  const searchCacheRef = useRef({
    query: searchQuery,
    activeTab,
    bookResults,
    bookNextPage,
    bookHasNext,
    userResults,
    userNextCursor,
    userHasNext,
    allBooks,
    allUsers,
    allBooksHasMore,
    allUsersHasMore,
  })
  searchCacheRef.current = {
    query: searchQuery,
    activeTab,
    bookResults,
    bookNextPage,
    bookHasNext,
    userResults,
    userNextCursor,
    userHasNext,
    allBooks,
    allUsers,
    allBooksHasMore,
    allUsersHasMore,
  }

  useEffect(() => {
    return () => {
      useSearchStore.setState(searchCacheRef.current)
    }
  }, [])

  // ISBN13이면 자동 도서 탭으로 강제 — 바코드 스캐너 결과/사용자 직접 입력 모두 커버
  useEffect(() => {
    if (isIsbnMode && activeTab !== 'book') {
      setActiveTab('book')
    }
  }, [isIsbnMode, activeTab])

  // [CodeRabbit fix] URL → 컴포넌트 state 단방향 동기화. 사용자 입력으로 인한
  // state 변경은 아래 "URL 동기화 effect"가 URL에 반영하고, 외부 경로로 URL이
  // 바뀌는 경우(브라우저 뒤로/앞으로, deep link 직접 진입, 다른 컴포넌트의 navigate)
  // 본 effect가 그 변경을 컴포넌트에 반영. 같은 값일 때는 setState가 no-op이라
  // 양방향 effect 사이의 무한 루프는 발생하지 않는다.
  // URL → state 동기화. searchParams 객체는 매 렌더마다 새 인스턴스라
  // deps에 넣으면 무한 루프가 발생. toString()으로 값 기반 비교.
  const searchParamsString = searchParams.toString()
  useEffect(() => {
    if (restoredFromCache.current) return
    // Effect 2가 내부적으로 URL을 변경한 경우 state 동기화를 건너뛴다 (양방향 루프 방지).
    if (isInternalNavRef.current) {
      isInternalNavRef.current = false
      return
    }
    const urlQuery = searchParams.get('q') ?? ''
    const urlTabRaw = searchParams.get('tab')
    const urlTab: SearchType = isSearchType(urlTabRaw) ? urlTabRaw : 'all'
    if (urlQuery !== searchQuery) setSearchQuery(urlQuery)
    if (urlTab !== activeTab) setActiveTab(urlTab)
    // searchQuery/activeTab은 의도적으로 deps에서 제외 — 이 effect는 URL이
    // 바뀔 때만 동기화하면 충분하고, state가 deps에 들어가면 루프 위험.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsString])

  // URL 쿼리 동기화 — 탭/검색어 변경 시 ?tab=...&q=... 업데이트
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (trimmedQuery) {
      next.set('q', trimmedQuery)
    } else {
      next.delete('q')
    }
    if (activeTab !== 'all') {
      next.set('tab', activeTab)
    } else {
      next.delete('tab')
    }
    if (next.toString() !== searchParams.toString()) {
      isInternalNavRef.current = true
      setSearchParams(next, { replace: true })
    }
    // [code-review LOW fix] searchParams를 deps에 넣으면 setSearchParams →
    // 새 searchParams 인스턴스 → effect 재실행의 무한 루프 위험. 위 toString
    // 비교 가드가 같은 값일 때 setSearchParams를 스킵하지만, 외부에서
    // searchParams를 직접 변경할 수 있는 경로가 생기면 본 effect가 그것을
    // 덮어쓸 수 있다(현재는 그런 경로 없음). 의도적으로 deps에서 제외하고
    // 비교 가드로 무한 루프만 차단.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, activeTab])

  // 도서 탭 첫 페이지 fetch (검색어 변경 시 debounce)
  useEffect(() => {
    if (restoredFromCache.current) return
    setIsBookLoadingMore(false)
    setBookLoadMoreError(null)
    bookMoreControllerRef.current?.abort()

    if (!trimmedQuery || activeTab !== 'book') {
      // 다른 탭이거나 검색어 비어있으면 도서 결과 초기화
      if (!trimmedQuery) {
        setBookResults([])
        setBookNextPage(null)
        setBookHasNext(false)
        setBookErrorMessage(null)
      }
      return
    }

    const controller = new AbortController()
    // [CodeRabbit fix] 400ms debounce 동안 이전 검색 결과가 그대로 보이는
    // stale UI 방지 — setTimeout 들어가기 전에 결과/cursor/에러 초기화하여
    // 사용자가 "검색 중..." placeholder만 보도록 한다.
    setBookResults([])
    setBookNextPage(null)
    setBookHasNext(false)
    setBookErrorMessage(null)
    setIsBookLoading(true)

    const handle = setTimeout(async () => {
      try {
        if (isValidIsbn13(trimmedQuery)) {
          // ISBN 모드: 단일 도서 정확 조회 — 페이지네이션 없음
          const book = await getBookByIsbn(trimmedQuery, controller.signal)
          if (controller.signal.aborted) return
          setBookResults([isbnResultToSummary(book)])
          setBookNextPage(null)
          setBookHasNext(false)
        } else {
          const response = await searchBooks(trimmedQuery, 20, 1, controller.signal)
          if (controller.signal.aborted) return
          setBookResults(response.content)
          setBookNextPage(response.hasNext ? 2 : null)
          setBookHasNext(response.hasNext)
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setBookErrorMessage(error instanceof Error ? error.message : '검색에 실패했습니다.')
        setBookResults([])
        setBookNextPage(null)
        setBookHasNext(false)
      } finally {
        if (!controller.signal.aborted) setIsBookLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(handle)
      controller.abort()
      bookMoreControllerRef.current?.abort()
    }
  }, [trimmedQuery, activeTab])

  // 유저 탭 첫 페이지 fetch
  useEffect(() => {
    if (restoredFromCache.current) return
    setIsUserLoadingMore(false)
    setUserLoadMoreError(null)
    userMoreControllerRef.current?.abort()

    if (!trimmedQuery || activeTab !== 'user') {
      if (!trimmedQuery) {
        setUserResults([])
        setUserNextCursor(null)
        setUserHasNext(false)
        setUserErrorMessage(null)
      }
      return
    }

    const controller = new AbortController()
    // [CodeRabbit fix] debounce 중 stale UI 방지 (도서 탭과 동일 정책).
    setUserResults([])
    setUserNextCursor(null)
    setUserHasNext(false)
    setUserErrorMessage(null)
    setIsUserLoading(true)

    const handle = setTimeout(async () => {
      try {
        const response = await searchAll({
          query: trimmedQuery,
          type: 'user',
          cursor: null,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setUserResults(response.users.content)
        setUserNextCursor(response.users.nextCursor)
        setUserHasNext(response.users.hasNext)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setUserErrorMessage(error instanceof Error ? error.message : '검색에 실패했습니다.')
        setUserResults([])
        setUserNextCursor(null)
        setUserHasNext(false)
      } finally {
        if (!controller.signal.aborted) setIsUserLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(handle)
      controller.abort()
      userMoreControllerRef.current?.abort()
    }
  }, [trimmedQuery, activeTab])

  // 전체 탭 fetch — books/users 두 섹션 미리보기, 페이징 없음
  useEffect(() => {
    // [#210] 도서/유저 탭과 달리 restoredFromCache 가드를 두지 않는다.
    // 전체 탭은 페이지네이션·스크롤 위치가 없는 5건 미리보기라 캐시를 보존할 이득이 없고,
    // 오히려 캐시 복원 후 가드에 막히면 stale 미리보기(예: 이전 검색의 도서 4건)가 그대로
    // 노출되다가 탭을 왕복해야 갱신되는 버그가 있었다. 캐시값은 useState 초기값으로 즉시
    // 렌더만 제공하고, effect가 항상 fresh fetch로 덮어쓴다. (도서/유저 탭은 무한스크롤
    // 위치 보존을 위해 기존 가드 유지.)
    if (!trimmedQuery || activeTab !== 'all') {
      if (!trimmedQuery) {
        setAllBooks([])
        setAllUsers([])
        setAllBooksHasMore(false)
        setAllUsersHasMore(false)
        setAllErrorMessage(null)
      }
      return
    }

    const controller = new AbortController()
    // [CodeRabbit fix] debounce 중 stale UI 방지.
    setAllBooks([])
    setAllUsers([])
    setAllBooksHasMore(false)
    setAllUsersHasMore(false)
    setAllErrorMessage(null)
    setIsAllLoading(true)

    const handle = setTimeout(async () => {
      try {
        const response = await searchAll({
          query: trimmedQuery,
          type: 'all',
          cursor: null,
          // [CodeRabbit nit fix] 미리보기 정책(ALL_TAB_PREVIEW_COUNT)에 맞춰
          // 백엔드 호출도 그 크기로 제한 — 사용 안 할 17건의 트래픽/페이로드 절약.
          limit: ALL_TAB_PREVIEW_COUNT,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setAllBooks(response.books.content)
        setAllUsers(response.users.content)
        setAllBooksHasMore(response.books.hasNext)
        setAllUsersHasMore(response.users.hasNext)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setAllErrorMessage(error instanceof Error ? error.message : '검색에 실패했습니다.')
        setAllBooks([])
        setAllUsers([])
      } finally {
        if (!controller.signal.aborted) setIsAllLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [trimmedQuery, activeTab])

  // 반드시 restoredFromCache를 참조하는 모든 effect 뒤에 선언할 것.
  // React는 useEffect를 선언 순서대로 실행하므로 위 effect들(URL→state·도서·유저 탭)이
  // 먼저 skip된 후 플래그가 해제된다. 전체 탭 effect는 #210 수정으로 이 가드를 쓰지 않는다.
  useEffect(() => {
    restoredFromCache.current = false
  }, [])

  /**
   * 도서 탭 다음 페이지 로딩. observer 콜백과 retry 버튼이 공유 호출.
   * stateRef에서 최신 상태 읽어 stale closure 회피.
   */
  const fetchMoreBooks = useCallback(async () => {
    const s = stateRef.current
    // [code-review MED fix] 비활성 탭에서 sentinel 콜백이 늦게 발화해도 fetch가
    // 진행되지 않도록 진입부 가드. observer disconnect와 별개의 안전망.
    if (s.activeTab !== 'book') return
    if (s.isBookLoadingMore || s.isBookLoading || !s.bookHasNext) return
    if (!s.bookNextPage) return
    if (isValidIsbn13(s.trimmedQuery)) return // ISBN 모드는 단일 결과
    const requestedQuery = s.trimmedQuery
    const requestedPage = s.bookNextPage

    bookMoreControllerRef.current?.abort()
    const controller = new AbortController()
    bookMoreControllerRef.current = controller

    setIsBookLoadingMore(true)
    setBookLoadMoreError(null)
    try {
      const response = await searchBooks(requestedQuery, 20, requestedPage, controller.signal)
      if (controller.signal.aborted) return
      if (stateRef.current.trimmedQuery !== requestedQuery) return
      setBookResults(prev => {
        const existingIds = new Set(prev.map(b => b.bookId))
        const deduped = response.content.filter(b => !existingIds.has(b.bookId))
        if (deduped.length === 0) {
          setBookHasNext(false)
          return prev
        }
        setBookNextPage(response.hasNext && requestedPage != null ? requestedPage + 1 : null)
        setBookHasNext(response.hasNext)
        return [...prev, ...deduped]
      })
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      if (stateRef.current.trimmedQuery !== requestedQuery) return
      setBookLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsBookLoadingMore(false)
    }
  }, [])

  /**
   * 유저 탭 다음 페이지 로딩. fetchMoreBooks와 동일 패턴.
   */
  const fetchMoreUsers = useCallback(async () => {
    const s = stateRef.current
    // [code-review MED fix] 비활성 탭 진입부 가드 (fetchMoreBooks와 동일 정책).
    if (s.activeTab !== 'user') return
    if (s.isUserLoadingMore || s.isUserLoading || !s.userHasNext) return
    const requestedQuery = s.trimmedQuery
    const requestedCursor = s.userNextCursor

    userMoreControllerRef.current?.abort()
    const controller = new AbortController()
    userMoreControllerRef.current = controller

    setIsUserLoadingMore(true)
    setUserLoadMoreError(null)
    try {
      const response = await searchAll({
        query: requestedQuery,
        type: 'user',
        cursor: requestedCursor,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (stateRef.current.trimmedQuery !== requestedQuery) return
      setUserResults(prev => [...prev, ...response.users.content])
      setUserNextCursor(response.users.nextCursor)
      setUserHasNext(response.users.hasNext)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      if (stateRef.current.trimmedQuery !== requestedQuery) return
      setUserLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsUserLoadingMore(false)
    }
  }, [])

  // 도서 sentinel observer
  const hasBookResults = bookResults.length > 0
  useEffect(() => {
    const sentinel = bookSentinelRef.current
    if (!sentinel || activeTab !== 'book') return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        if (stateRef.current.bookLoadMoreError) return
        fetchMoreBooks()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchMoreBooks, hasBookResults, activeTab])

  // 유저 sentinel observer
  const hasUserResults = userResults.length > 0
  useEffect(() => {
    const sentinel = userSentinelRef.current
    if (!sentinel || activeTab !== 'user') return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        if (stateRef.current.userLoadMoreError) return
        fetchMoreUsers()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchMoreUsers, hasUserResults, activeTab])

  const retryLoadMoreBooks = () => {
    setBookLoadMoreError(null)
    fetchMoreBooks()
  }
  const retryLoadMoreUsers = () => {
    setUserLoadMoreError(null)
    fetchMoreUsers()
  }

  const commitKeyword = (keyword: string) => {
    const value = keyword.trim()
    if (!value) return
    setRecentKeywords(prev => {
      if (prev[0] === value) return prev
      const next = [value, ...prev.filter(k => k !== value)].slice(0, MAX_RECENT_KEYWORDS)
      saveRecentKeywords(next)
      return next
    })
  }

  const removeKeyword = (keyword: string) => {
    setRecentKeywords(prev => {
      const next = prev.filter(k => k !== keyword)
      saveRecentKeywords(next)
      return next
    })
  }

  const clearAllKeywords = () => {
    setRecentKeywords([])
    saveRecentKeywords([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && trimmedQuery) {
      commitKeyword(trimmedQuery)
    }
  }

  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword)
    commitKeyword(keyword)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="Shelfeed" showBack />

      {/* Search Bar */}
      <div className="border-b border-border px-4 py-3" role="search">
        <label htmlFor="book-search-input" className="sr-only">
          통합 검색
        </label>
        <div className="flex h-12 w-full items-stretch rounded-xl border border-primary/10 bg-primary/5">
          <div className="flex items-center justify-center pl-4 text-primary/60">
            <span className="material-symbols-outlined text-[22px]">search</span>
          </div>
          <input
            id="book-search-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="도서 또는 유저 검색"
            placeholder={
              activeTab === 'user'
                ? '닉네임으로 유저 검색'
                : activeTab === 'book'
                  ? '도서 제목, 저자, ISBN 검색'
                  : '도서 또는 유저 검색'
            }
            className="h-full min-w-0 flex-1 border-none bg-transparent px-3 text-base font-normal outline-none placeholder:text-primary/40 focus:ring-0"
          />
          {/* 바코드 스캐너: 도서/전체 탭에서 표시. ISBN 감지 시 자동으로 도서 탭 전환 */}
          {(activeTab === 'book' || activeTab === 'all') && (
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              aria-label="바코드 스캔으로 ISBN 검색"
              className="flex items-center justify-center pr-4 text-primary transition-colors hover:text-primary/70"
            >
              <span className="material-symbols-outlined text-[24px]">barcode_scanner</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border" role="tablist">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex-1 border-b-2 py-3 text-sm font-bold transition-colors',
                activeTab === tab.value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Keywords — 검색어가 비어있을 때만 표시 */}
      {!trimmedQuery && recentKeywords.length > 0 && (
        <div className="border-b border-border px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary/70">
              최근 검색어
            </h4>
            <button
              type="button"
              onClick={clearAllKeywords}
              className="text-xs text-primary/40 hover:text-primary"
            >
              전체 삭제
            </button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
            {recentKeywords.map(keyword => (
              <div
                key={keyword}
                className="flex h-8 shrink-0 items-center justify-center gap-x-1 rounded-full border border-primary/5 bg-primary/10 px-3"
              >
                <button
                  type="button"
                  onClick={() => handleKeywordClick(keyword)}
                  className="text-sm font-medium leading-normal text-primary"
                >
                  {keyword}
                </button>
                <button
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  aria-label={`'${keyword}' 최근 검색어 삭제`}
                >
                  <span className="material-symbols-outlined cursor-pointer text-[16px] text-primary/60">
                    close
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      <main className="flex-1 overflow-y-auto px-4 pb-24">
        {/* 전체 탭 */}
        {activeTab === 'all' && trimmedQuery && (
          <AllTabContent
            isLoading={isAllLoading}
            errorMessage={allErrorMessage}
            books={allBooks}
            users={allUsers}
            booksHasMore={allBooksHasMore}
            usersHasMore={allUsersHasMore}
            previewCount={ALL_TAB_PREVIEW_COUNT}
            onJumpToBookTab={() => setActiveTab('book')}
            onJumpToUserTab={() => setActiveTab('user')}
            commitKeyword={() => commitKeyword(trimmedQuery)}
          />
        )}

        {/* 도서 탭 */}
        {activeTab === 'book' && trimmedQuery && (
          <>
            {isBookLoading && bookResults.length === 0 && (
              <p
                role="status"
                aria-busy="true"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                검색 중...
              </p>
            )}

            {!isBookLoading && bookErrorMessage && (
              <p role="alert" className="py-10 text-center text-sm text-destructive">
                {bookErrorMessage}
              </p>
            )}

            {!isBookLoading && !bookErrorMessage && bookResults.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                  search_off
                </span>
                <p className="max-w-full truncate text-sm text-muted-foreground">
                  &lsquo;{trimmedQuery}&rsquo;에 대한 도서 검색 결과가 없습니다.
                </p>
              </div>
            )}

            {bookResults.length > 0 && (
              <div className="flex flex-col">
                {bookResults.map(book => (
                  <Link
                    key={book.bookId}
                    to={`/book/${book.bookId}`}
                    onClick={() => commitKeyword(trimmedQuery)}
                    className="flex items-start gap-4 border-b border-primary/5 py-5"
                  >
                    <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-primary/5 shadow-sm">
                      {book.coverImageUrl ? (
                        <img
                          src={book.coverImageUrl}
                          alt={book.title}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <span className="material-symbols-outlined text-2xl text-muted-foreground/40">
                            menu_book
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="line-clamp-2 text-lg font-bold leading-tight text-primary">
                        {book.title}
                      </h3>
                      <p className="truncate text-sm text-muted-foreground">{book.author} 저</p>
                      <p className="truncate text-xs text-muted-foreground/70">{book.publisher}</p>
                      {book.inMyLibrary && (
                        <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          내 서재에 있음
                        </span>
                      )}
                    </div>
                  </Link>
                ))}

                <div ref={bookSentinelRef} className="h-10" aria-hidden="true" />

                {isBookLoadingMore && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    더 불러오는 중...
                  </p>
                )}

                {bookLoadMoreError && !isBookLoadingMore && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p role="alert" className="text-sm text-destructive">
                      {bookLoadMoreError}
                    </p>
                    <button
                      type="button"
                      onClick={retryLoadMoreBooks}
                      className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                    >
                      다시 불러오기
                    </button>
                  </div>
                )}

                {!bookHasNext && !isBookLoadingMore && !bookLoadMoreError && !isIsbnMode && (
                  <p className="py-4 text-center text-xs text-muted-foreground/50">
                    모든 결과를 확인했습니다
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* 유저 탭 */}
        {activeTab === 'user' && trimmedQuery && (
          <>
            {isUserLoading && userResults.length === 0 && (
              <p
                role="status"
                aria-busy="true"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                검색 중...
              </p>
            )}

            {!isUserLoading && userErrorMessage && (
              <p role="alert" className="py-10 text-center text-sm text-destructive">
                {userErrorMessage}
              </p>
            )}

            {!isUserLoading && !userErrorMessage && userResults.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                  person_search
                </span>
                <p className="max-w-full truncate text-sm text-muted-foreground">
                  &lsquo;{trimmedQuery}&rsquo;에 대한 유저 검색 결과가 없습니다.
                </p>
              </div>
            )}

            {userResults.length > 0 && (
              <div className="flex flex-col">
                {userResults.map(user => (
                  <UserSearchCard key={user.userId} user={user} />
                ))}

                <div ref={userSentinelRef} className="h-10" aria-hidden="true" />

                {isUserLoadingMore && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    더 불러오는 중...
                  </p>
                )}

                {userLoadMoreError && !isUserLoadingMore && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p role="alert" className="text-sm text-destructive">
                      {userLoadMoreError}
                    </p>
                    <button
                      type="button"
                      onClick={retryLoadMoreUsers}
                      className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                    >
                      다시 불러오기
                    </button>
                  </div>
                )}

                {!userHasNext && !isUserLoadingMore && !userLoadMoreError && (
                  <p className="py-4 text-center text-xs text-muted-foreground/50">
                    모든 결과를 확인했습니다
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />

      {/* 카메라 모달 — lazy import로 메인 번들 영향 최소화 */}
      <Suspense fallback={null}>
        <IsbnScannerModal
          open={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          validate={isValidIsbn13}
          onDetected={isbn => {
            // 스캔 결과를 검색창에 주입 → ISBN 자동 감지 effect가 ISBN 모드로 분기 (단일 진입점)
            setIsScannerOpen(false)
            setSearchQuery(isbn)
            setActiveTab('book')
            commitKeyword(isbn)
          }}
        />
      </Suspense>
    </div>
  )
}

/**
 * 전체 탭 — books/users 두 섹션을 미리보기 N건씩 렌더하고 "더 보기" 클릭 시
 * 해당 탭으로 점프. 페이징은 도서/유저 탭에서만 수행 (UX 단순화).
 */
function AllTabContent({
  isLoading,
  errorMessage,
  books,
  users,
  booksHasMore,
  usersHasMore,
  previewCount,
  onJumpToBookTab,
  onJumpToUserTab,
  commitKeyword,
}: {
  isLoading: boolean
  errorMessage: string | null
  books: BookSearchItem[]
  users: UserSearchItem[]
  booksHasMore: boolean
  usersHasMore: boolean
  previewCount: number
  onJumpToBookTab: () => void
  onJumpToUserTab: () => void
  commitKeyword: () => void
}) {
  if (isLoading && books.length === 0 && users.length === 0) {
    return (
      <p role="status" aria-busy="true" className="py-10 text-center text-sm text-muted-foreground">
        검색 중...
      </p>
    )
  }

  if (!isLoading && errorMessage) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-destructive">
        {errorMessage}
      </p>
    )
  }

  if (!isLoading && books.length === 0 && users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
          search_off
        </span>
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      </div>
    )
  }

  const previewBooks = books.slice(0, previewCount)
  const previewUsers = users.slice(0, previewCount)
  const showBookMoreButton = booksHasMore || books.length >= previewCount
  const showUserMoreButton = usersHasMore || users.length >= previewCount

  return (
    <div className="flex flex-col gap-4 py-2">
      {previewBooks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-primary">도서 ({books.length}건)</h2>
          <div className="flex flex-col">
            {previewBooks.map(book => (
              <Link
                key={book.bookId}
                to={`/book/${book.bookId}`}
                onClick={commitKeyword}
                className="flex items-start gap-4 border-b border-primary/5 py-4"
              >
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-primary/5 shadow-sm">
                  {book.coverImageUrl ? (
                    <img
                      src={book.coverImageUrl}
                      alt={book.title}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <span className="material-symbols-outlined text-xl text-muted-foreground/40">
                        menu_book
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="line-clamp-2 text-base font-bold leading-tight text-primary">
                    {book.title}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                  {book.reviewCount > 0 && (
                    <p className="text-xs text-muted-foreground/70">
                      ★ {book.averageRating.toFixed(1)} · 감상 {book.reviewCount}개
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          {showBookMoreButton && (
            <button
              type="button"
              onClick={onJumpToBookTab}
              className="mt-2 w-full rounded-lg bg-primary/5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              도서 검색 결과 전체 보기
            </button>
          )}
        </section>
      )}

      {previewUsers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-primary">유저 ({users.length}건)</h2>
          <div className="flex flex-col">
            {previewUsers.map(user => (
              <UserSearchCard key={user.userId} user={user} />
            ))}
          </div>
          {showUserMoreButton && (
            <button
              type="button"
              onClick={onJumpToUserTab}
              className="mt-2 w-full rounded-lg bg-primary/5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              유저 검색 결과 전체 보기
            </button>
          )}
        </section>
      )}
    </div>
  )
}
