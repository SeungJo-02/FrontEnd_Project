import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { cn } from '@/lib/utils'
import AppHeader from '@/components/layout/AppHeader'
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  type FollowMemberSummary,
} from '@/api/follow'
import { getUserProfile } from '@/api/member'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { Screen } from '@/components/layout/Screen'
import StatusMessage from '@/components/ui/StatusMessage'
import Button from '@/components/ui/Button'

type TabValue = 'followers' | 'following'

const tabs: { value: TabValue; label: string }[] = [
  { value: 'followers', label: '팔로워' },
  { value: 'following', label: '팔로잉' },
]

export default function FollowListPage() {
  const { userId } = useParams<{ userId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const myUserId = useAuthStore(state => state.user?.id)

  const isValidId = /^\d+$/.test(userId ?? '')
  const numericUserId = isValidId ? parseInt(userId!, 10) : 0

  // URL 쿼리를 단일 진실 원천으로 사용 — 브라우저 back/forward에서도 자동 동기화
  const activeTab: TabValue = searchParams.get('tab') === 'following' ? 'following' : 'followers'

  const setActiveTab = (tab: TabValue) => {
    setSearchParams(
      prev => {
        if (prev.get('tab') === tab) return prev
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        return next
      },
      { replace: true }
    )
  }

  const [nickname, setNickname] = useState<string | null>(null)
  const [items, setItems] = useState<FollowMemberSummary[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  // 카드별 토글 진행 상태 (userId → in-flight 여부)
  const [togglingIds, setTogglingIds] = useState<Set<number>>(() => new Set())
  // 카드별 토글 에러 메시지 (userId → message)
  const [toggleErrors, setToggleErrors] = useState<Map<number, string>>(() => new Map())

  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  const stateRef = useRef({
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeTab,
    loadMoreError,
  })
  stateRef.current = {
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    activeTab,
    loadMoreError,
  }

  // StrictMode 안전: setup에서 true 명시 리셋
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 닉네임은 별도 호출로 가져옴 (직접 URL 진입에도 동작 보장)
  useEffect(() => {
    // 라우트 변경/중단 시 이전 사용자 닉네임이 헤더에 잔류하지 않도록 즉시 fallback으로 리셋
    setNickname(null)
    if (!isValidId) return
    const controller = new AbortController()
    ;(async () => {
      try {
        const profile = await getUserProfile(numericUserId, controller.signal)
        if (controller.signal.aborted) return
        setNickname(profile.nickname)
      } catch {
        // 닉네임 조회 실패는 silent — 목록 조회 자체가 메인 경로
      }
    })()
    return () => controller.abort()
  }, [isValidId, numericUserId])

  // 초기 로딩 + 탭 변경 시 재요청
  useEffect(() => {
    if (!isValidId) {
      setErrorMessage('잘못된 사용자 ID입니다.')
      setIsLoading(false)
      // 이전 탭에서 로드된 항목/페이지네이션 상태가 잔류하지 않도록 함께 리셋
      setItems([])
      setNextCursor(null)
      setHasNext(false)
      return
    }

    setIsLoadingMore(false)
    setLoadMoreError(null)
    moreControllerRef.current?.abort()

    const controller = new AbortController()
    setItems([])
    setNextCursor(null)
    setHasNext(false)
    setIsLoading(true)
    setErrorMessage(null)

    const fetcher = activeTab === 'followers' ? getFollowers : getFollowing
    ;(async () => {
      try {
        const response = await fetcher({
          userId: numericUserId,
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
        setErrorMessage(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
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
  }, [isValidId, numericUserId, activeTab])

  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext) return
    const requestedTab = s.activeTab
    const requestedCursor = s.nextCursor

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const fetcher = requestedTab === 'followers' ? getFollowers : getFollowing
      const response = await fetcher({
        userId: numericUserId,
        cursor: requestedCursor,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      // 탭이 바뀌었다면 응답 버림 (stale guard)
      if (stateRef.current.activeTab !== requestedTab) return
      setItems(prev => [...prev, ...response.content])
      setNextCursor(response.nextCursor)
      setHasNext(response.hasNext)
    } catch (error) {
      // normalizeAxiosError가 cancel은 rethrow하므로 여기서 분기 필수
      if (axios.isCancel(error) || controller.signal.aborted) return
      // 탭이 바뀌었다면 에러도 버림
      if (stateRef.current.activeTab !== requestedTab) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [numericUserId])

  // sentinel ref callback: 조건부 렌더된 sentinel 마운트/언마운트에 따라 observer 재부착이 자동
  const sentinelRef = useCallback(
    (node: HTMLLIElement | null) => {
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

  const handleToggleCard = async (target: FollowMemberSummary) => {
    if (togglingIds.has(target.userId)) return
    const wasFollowing = target.isFollowing
    // 탭이 토글 도중 바뀌면 응답을 list에 반영하지 않기 위한 stale guard 스냅샷
    const requestedTab = activeTab
    setTogglingIds(prev => {
      const next = new Set(prev)
      next.add(target.userId)
      return next
    })
    setToggleErrors(prev => {
      if (!prev.has(target.userId)) return prev
      const next = new Map(prev)
      next.delete(target.userId)
      return next
    })
    try {
      if (wasFollowing) {
        await unfollowUser(target.userId)
      } else {
        await followUser(target.userId)
      }
      if (!isMountedRef.current) return
      // 탭이 그 사이 바뀌었다면 list 갱신 스킵 (다른 fetcher의 결과로 채워졌을 수 있음)
      if (stateRef.current.activeTab !== requestedTab) return
      // 내 팔로잉 목록에서 언팔로우한 경우, 해당 항목은 더 이상 팔로잉이 아니므로 목록에서 제거
      const isMyFollowingTab =
        myUserId != null && numericUserId === myUserId && requestedTab === 'following'
      if (isMyFollowingTab && wasFollowing) {
        setItems(prev => prev.filter(it => it.userId !== target.userId))
      } else {
        setItems(prev =>
          prev.map(it => (it.userId === target.userId ? { ...it, isFollowing: !wasFollowing } : it))
        )
      }
    } catch (error) {
      if (!isMountedRef.current) return
      const message = error instanceof Error ? error.message : '요청에 실패했습니다.'
      setToggleErrors(prev => {
        const next = new Map(prev)
        next.set(target.userId, message)
        return next
      })
    } finally {
      // finally 블록의 early return은 no-unsafe-finally 위반이라 if 래핑 사용
      if (isMountedRef.current) {
        setTogglingIds(prev => {
          const next = new Set(prev)
          next.delete(target.userId)
          return next
        })
      }
    }
  }

  const headerTitle = nickname ?? '사용자'

  return (
    <Screen>
      <AppHeader title={headerTitle} showBack />

      {/* 탭 */}
      <div className="flex border-b border-border" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'flex-1 py-4 text-sm font-semibold transition-colors',
              activeTab === tab.value
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-primary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto pb-12">
        {isLoading && items.length === 0 && (
          <StatusMessage tone="loading">불러오는 중...</StatusMessage>
        )}

        {!isLoading && errorMessage && <StatusMessage tone="error">{errorMessage}</StatusMessage>}

        {!isLoading && !errorMessage && items.length === 0 && (
          <EmptyState
            icon="group"
            message={activeTab === 'followers' ? '아직 팔로워가 없어요.' : '아직 팔로잉이 없어요.'}
          />
        )}

        {items.length > 0 && (
          <ul className="flex flex-col">
            {items.map(item => {
              const isMe = myUserId != null && item.userId === myUserId
              const isToggling = togglingIds.has(item.userId)
              return (
                <li
                  key={item.userId}
                  className="flex flex-col gap-1 border-b border-border/50 px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/user/${item.userId}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar
                        src={item.profileImageUrl}
                        alt={`${item.nickname} 프로필 이미지`}
                        className="size-12 shrink-0"
                        iconClassName="text-2xl text-muted-foreground/40"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.nickname}</p>
                        {item.bio && (
                          <p className="truncate text-xs text-muted-foreground">{item.bio}</p>
                        )}
                      </div>
                    </Link>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => handleToggleCard(item)}
                        disabled={isToggling}
                        aria-pressed={item.isFollowing}
                        className={
                          item.isFollowing
                            ? 'shrink-0 rounded-full border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60'
                            : 'shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                        }
                      >
                        {isToggling ? '처리 중' : item.isFollowing ? '팔로우 취소' : '맞팔로우'}
                      </button>
                    )}
                  </div>
                  {toggleErrors.get(item.userId) && (
                    <p role="alert" className="ml-[60px] text-xs text-destructive">
                      {toggleErrors.get(item.userId)}
                    </p>
                  )}
                </li>
              )
            })}

            {/* 무한 스크롤 sentinel — <ul> 직계 자식은 <li>여야 유효 마크업 */}
            <li ref={sentinelRef} aria-hidden="true" className="h-10 list-none" />

            {isLoadingMore && (
              <li className="list-none py-4 text-center text-xs text-muted-foreground">
                더 불러오는 중...
              </li>
            )}

            {loadMoreError && !isLoadingMore && (
              <li className="flex list-none flex-col items-center gap-2 py-4">
                <p role="alert" className="text-sm text-destructive">
                  {loadMoreError}
                </p>
                <Button variant="soft" size="sm" onClick={retryLoadMore}>
                  다시 불러오기
                </Button>
              </li>
            )}

            {!hasNext && !isLoadingMore && !loadMoreError && (
              <li className="list-none py-4 text-center text-xs text-muted-foreground/50">
                모든 사용자를 확인했습니다
              </li>
            )}
          </ul>
        )}
      </main>
    </Screen>
  )
}
