import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import { getBlockedUsers, unblockUser, type BlockedUser } from '@/api/block'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'

/**
 * 차단한 사용자 목록 페이지 (`/settings/blocked`).
 *
 * SettingsPage "차단한 사용자" 항목에서 진입. 차단 해제 시 confirm 후
 * 즉시 목록에서 제거(낙관적) → API 실패 시 함수형 setState로 롤백하여
 * 동시 해제 요청 간 stale closure 문제를 방지.
 */
export default function BlockedUsersPage() {
  const [users, setUsers] = useState<BlockedUser[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const unblockingIdsRef = useRef(new Set<number>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef({ hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError })
  stateRef.current = { hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError }

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const result = await getBlockedUsers({ signal: controller.signal })
        if (controller.signal.aborted) return
        setUsers(result.content)
        setNextCursor(result.nextCursor)
        setHasNext(result.hasNext)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '차단 목록을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()
    return () => {
      controller.abort()
      moreControllerRef.current?.abort()
    }
  }, [])

  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext) return

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const result = await getBlockedUsers({ cursor: s.nextCursor, signal: controller.signal })
      if (controller.signal.aborted) return
      setUsers(prev => {
        const existingIds = new Set(prev.map(u => u.userId))
        const deduped = result.content.filter(u => !existingIds.has(u.userId))
        return deduped.length > 0 ? [...prev, ...deduped] : prev
      })
      setNextCursor(result.nextCursor)
      setHasNext(result.hasNext)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [])

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      if (!node) {
        observerRef.current = null
        return
      }
      observerRef.current = new IntersectionObserver(
        entries => {
          if (!entries[0]?.isIntersecting) return
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

  /**
   * 차단 해제. 낙관적으로 목록에서 즉시 제거 후, API 실패 시 함수형 setState로
   * 해당 유저를 현재 state 기준으로 다시 삽입. closure 캡처가 아닌 prev 기반이라
   * 동시 해제 요청 간 롤백이 서로를 덮어쓰지 않는다.
   */
  const handleUnblock = async (user: BlockedUser) => {
    if (unblockingIdsRef.current.has(user.userId)) return
    if (!window.confirm(`${user.nickname}님의 차단을 해제하시겠습니까?`)) return

    unblockingIdsRef.current.add(user.userId)
    setUsers(prev => prev.filter(u => u.userId !== user.userId))

    try {
      await unblockUser(user.userId)
    } catch {
      setUsers(prev => (prev.some(u => u.userId === user.userId) ? prev : [...prev, user]))
    } finally {
      unblockingIdsRef.current.delete(user.userId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="차단한 사용자" showBack />
        <main aria-busy="true" className="flex flex-1 items-center justify-center pb-24">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="차단한 사용자" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <span className="material-symbols-outlined text-5xl text-muted-foreground/30">error</span>
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage}
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="차단한 사용자" showBack />

      <main className="flex-1 overflow-y-auto pb-24">
        {users.length === 0 ? (
          <EmptyState icon="person_off" message="차단한 사용자가 없습니다" />
        ) : (
          <section className="px-5 pt-4">
            <div className="overflow-hidden rounded-[28px] bg-card shadow-sm">
              {users.map((user, idx) => (
                <div
                  key={user.userId}
                  className={`flex items-center justify-between gap-3 px-5 py-4 ${
                    idx < users.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      src={user.profileImageUrl}
                      alt={user.nickname}
                      className="size-11 shrink-0"
                      iconClassName="text-[20px]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-foreground">
                        {user.nickname}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(user.blockedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(user)}
                    className="shrink-0 rounded-full border border-destructive/30 px-4 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    차단 해제
                  </button>
                </div>
              ))}
            </div>

            {hasNext && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}

            {isLoadingMore && (
              <p className="py-4 text-center text-xs text-muted-foreground">더 불러오는 중...</p>
            )}

            {loadMoreError && !isLoadingMore && (
              <div className="flex flex-col items-center gap-2 py-4">
                <p role="alert" className="text-sm text-destructive">
                  {loadMoreError}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoadMoreError(null)
                    fetchMore()
                  }}
                  className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  다시 불러오기
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
