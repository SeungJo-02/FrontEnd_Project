import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import {
  ALL_TAB_PREVIEW_COUNT,
  isSearchType,
  isValidIsbn13,
  type SearchType,
} from '@/features/search/types'
import { searchSession } from '@/features/search/searchSession'
import { useRecentKeywords } from '@/features/search/hooks/useRecentKeywords'
import { useBookSearch } from '@/features/search/hooks/useBookSearch'
import { useUserSearch } from '@/features/search/hooks/useUserSearch'
import { useAllSearch } from '@/features/search/hooks/useAllSearch'
import SearchBar from '@/features/search/components/SearchBar'
import SearchTabs from '@/features/search/components/SearchTabs'
import RecentKeywords from '@/features/search/components/RecentKeywords'
import AllTabContent from '@/features/search/components/AllTabContent'
import BookResultList from '@/features/search/components/BookResultList'
import UserResultList from '@/features/search/components/UserResultList'
import IsbnScanEntry from '@/features/search/components/IsbnScanEntry'

/**
 * 통합 검색 페이지 (`/search`).
 *
 * 탭(전체/도서/유저)으로 분기하여 단일 진입점에서 도서와 유저를 모두 검색한다.
 * URL 쿼리 `?tab=...&q=...`로 deep link/새로고침 보존.
 *
 * **API 분리 정책**:
 * - 도서 탭: `searchBooks` (`/api/v1/books/search`) — publisher/publishedDate/inMyLibrary +
 *   ISBN 자동 인식 + 바코드 스캐너.
 * - 유저 탭 / 전체 탭: 통합 검색 `searchAll` (`/api/v1/search`).
 *
 * **데이터/캐싱**: 탭별 조회는 React Query 훅(useBookSearch/useUserSearch/useAllSearch)이
 * 담당하며 검색 결과 캐시도 React Query가 보유한다. 무한 스크롤은 IntersectionObserver가
 * `fetchNextPage` 트리거 용도로만 사용된다(목록 컴포넌트 내부). 검색어/탭은 URL과
 * 동기화하고, URL 없이 재진입 시 `searchSession`에서 복원한다.
 */
export default function BookSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const { recentKeywords, commitKeyword, removeKeyword, clearAll } = useRecentKeywords()

  const urlQuery = searchParams.get('q')
  const urlTabRaw = searchParams.get('tab')
  const urlTab = isSearchType(urlTabRaw) ? urlTabRaw : null
  const hasUrlParams = urlQuery !== null || urlTab !== null
  const hasSession = searchSession.query.trim().length > 0
  const restoredFromSession = useRef(hasSession && !hasUrlParams)

  const [searchQuery, setSearchQuery] = useState(
    urlQuery ?? (hasSession ? searchSession.query : '')
  )
  const [activeTab, setActiveTab] = useState<SearchType>(
    urlTab ?? (hasSession ? searchSession.activeTab : 'all')
  )
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  const trimmedQuery = searchQuery.trim()
  const isIsbnMode = isValidIsbn13(trimmedQuery)

  // Effect 2(state→URL)가 직접 URL을 바꿀 때 세우는 플래그.
  // Effect 1(URL→state)은 이 플래그가 서있으면 setState를 건너뛰어 양방향 루프를 차단한다.
  const isInternalNavRef = useRef(false)

  const bookView = useBookSearch(trimmedQuery, activeTab === 'book')
  const userView = useUserSearch(trimmedQuery, activeTab === 'user')
  const allView = useAllSearch(trimmedQuery, activeTab === 'all')

  // ISBN13이면 자동 도서 탭으로 강제 — 바코드 스캐너 결과/사용자 직접 입력 모두 커버
  useEffect(() => {
    if (isIsbnMode && activeTab !== 'book') {
      setActiveTab('book')
    }
  }, [isIsbnMode, activeTab])

  // URL → 컴포넌트 state 단방향 동기화. searchParams 객체는 매 렌더마다 새 인스턴스라
  // toString() 값 기반 비교로 비교한다.
  const searchParamsString = searchParams.toString()
  useEffect(() => {
    if (restoredFromSession.current) return
    // Effect 2가 내부적으로 URL을 변경한 경우 state 동기화를 건너뛴다 (양방향 루프 방지).
    if (isInternalNavRef.current) {
      isInternalNavRef.current = false
      return
    }
    const nextQuery = searchParams.get('q') ?? ''
    const nextTabRaw = searchParams.get('tab')
    const nextTab: SearchType = isSearchType(nextTabRaw) ? nextTabRaw : 'all'
    if (nextQuery !== searchQuery) setSearchQuery(nextQuery)
    if (nextTab !== activeTab) setActiveTab(nextTab)
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
    // searchParams를 deps에 넣으면 무한 루프 위험. 위 toString 비교 가드로 차단하고
    // 의도적으로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, activeTab])

  // 검색어/탭을 in-memory 세션에 기록 — URL 없이 재진입 시 복원에 사용.
  useEffect(() => {
    searchSession.query = searchQuery
    searchSession.activeTab = activeTab
  }, [searchQuery, activeTab])

  // 반드시 위 동기화 effect들 뒤에 선언. React는 useEffect를 선언 순서대로 실행하므로
  // URL→state effect가 먼저 skip된 후 본 플래그가 해제된다.
  useEffect(() => {
    restoredFromSession.current = false
  }, [])

  const handleEnter = () => {
    if (trimmedQuery) commitKeyword(trimmedQuery)
  }

  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword)
    commitKeyword(keyword)
  }

  const handleDetected = (isbn: string) => {
    // 스캔 결과를 검색창에 주입 → ISBN 자동 감지 effect가 ISBN 모드로 분기 (단일 진입점)
    setIsScannerOpen(false)
    setSearchQuery(isbn)
    setActiveTab('book')
    commitKeyword(isbn)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="Shelfeed" showBack />

      <SearchBar
        value={searchQuery}
        activeTab={activeTab}
        onChange={setSearchQuery}
        onEnter={handleEnter}
        onScanClick={() => setIsScannerOpen(true)}
      />

      <SearchTabs activeTab={activeTab} onChange={setActiveTab} />

      {/* Recent Keywords — 검색어가 비어있을 때만 표시 */}
      {!trimmedQuery && recentKeywords.length > 0 && (
        <RecentKeywords
          keywords={recentKeywords}
          onSelect={handleKeywordClick}
          onRemove={removeKeyword}
          onClearAll={clearAll}
        />
      )}

      {/* Search Results */}
      <main className="flex-1 overflow-y-auto px-4 pb-24">
        {/* 전체 탭 */}
        {activeTab === 'all' && trimmedQuery && (
          <AllTabContent
            isLoading={allView.isLoading}
            errorMessage={allView.errorMessage}
            books={allView.books}
            users={allView.users}
            booksHasMore={allView.booksHasMore}
            usersHasMore={allView.usersHasMore}
            previewCount={ALL_TAB_PREVIEW_COUNT}
            onJumpToBookTab={() => setActiveTab('book')}
            onJumpToUserTab={() => setActiveTab('user')}
            onCommit={() => commitKeyword(trimmedQuery)}
          />
        )}

        {/* 도서 탭 */}
        {activeTab === 'book' && trimmedQuery && (
          <BookResultList
            query={trimmedQuery}
            books={bookView.books}
            isLoading={bookView.isLoading}
            isLoadingMore={bookView.isLoadingMore}
            errorMessage={bookView.errorMessage}
            loadMoreError={bookView.loadMoreError}
            hasNext={bookView.hasNext}
            isIsbnMode={isIsbnMode}
            onLoadMore={bookView.fetchMore}
            onRetryLoadMore={bookView.retryLoadMore}
            onCommit={() => commitKeyword(trimmedQuery)}
          />
        )}

        {/* 유저 탭 */}
        {activeTab === 'user' && trimmedQuery && (
          <UserResultList
            query={trimmedQuery}
            users={userView.users}
            isLoading={userView.isLoading}
            isLoadingMore={userView.isLoadingMore}
            errorMessage={userView.errorMessage}
            loadMoreError={userView.loadMoreError}
            hasNext={userView.hasNext}
            onLoadMore={userView.fetchMore}
            onRetryLoadMore={userView.retryLoadMore}
          />
        )}
      </main>

      <BottomNav />

      <IsbnScanEntry
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleDetected}
      />
    </div>
  )
}
