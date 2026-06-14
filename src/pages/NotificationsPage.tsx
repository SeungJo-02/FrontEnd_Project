import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationItem,
  type NotificationType,
} from '@/api/notification'
import BottomNav from '@/components/layout/BottomNav'

type TabValue = 'all' | 'unread'

/**
 * 백엔드 `NotificationType`별 우상단 아이콘/배경색 매핑.
 *
 * `REVIEW_LIKE`/`COMMENT_LIKE`는 시각적으로 동일하게 좋아요(빨강 하트)로 표시한다.
 * `SYSTEM`은 actor가 없으므로 회색 톤으로 처리.
 */
const typeIcon: Record<NotificationType, { icon: string; bg: string }> = {
  REVIEW_LIKE: { icon: 'favorite', bg: 'bg-red-500' },
  COMMENT: { icon: 'chat_bubble', bg: 'bg-blue-500' },
  COMMENT_LIKE: { icon: 'favorite', bg: 'bg-red-500' },
  FOLLOW: { icon: 'person_add', bg: 'bg-emerald-500' },
  FOLLOWING_REVIEW: { icon: 'rate_review', bg: 'bg-violet-500' },
  SYSTEM: { icon: 'campaign', bg: 'bg-muted-foreground' },
}

/**
 * `actor`가 있는 알림(좋아요/댓글/팔로우)의 메시지 본문을 만든다.
 *
 * 백엔드는 `message`를 null로 내려주는 경우가 있어(현재 트리거 미구현) 타입별 기본
 * 문구를 프론트에서 합성한다. 백엔드 트리거 머지 후 message가 채워지면 그 값을
 * 우선 사용한다.
 */
function buildNotificationMessage(n: NotificationItem): string {
  if (n.message) return n.message
  switch (n.type) {
    case 'REVIEW_LIKE':
      return '님이 회원님의 감상에 좋아요를 눌렀습니다.'
    case 'COMMENT':
      return '님이 회원님의 감상에 댓글을 남겼습니다.'
    case 'COMMENT_LIKE':
      return '님이 회원님의 댓글에 좋아요를 눌렀습니다.'
    case 'FOLLOW':
      return '님이 회원님을 팔로우하기 시작했습니다.'
    case 'FOLLOWING_REVIEW':
      return '님이 새 감상을 작성했습니다.'
    case 'SYSTEM':
      return '새로운 시스템 알림이 있습니다.'
  }
}

/**
 * 알림 클릭 시 이동할 경로를 결정한다.
 *
 * - 좋아요/댓글 계열 → 해당 감상 상세
 * - 팔로우 → 행위자 프로필
 * - 시스템 → 이동 없음 (null)
 */
function resolveDestination(n: NotificationItem): string | null {
  switch (n.type) {
    case 'REVIEW_LIKE':
      return n.reviewId != null ? `/review/${n.reviewId}` : null
    case 'COMMENT':
    case 'COMMENT_LIKE':
      return n.reviewId != null ? `/review/${n.reviewId}#comments` : null
    case 'FOLLOW':
      return n.actor ? `/user/${n.actor.userId}` : null
    case 'FOLLOWING_REVIEW':
      // reviewId는 항상 존재해야 함; null이면 백엔드 이상
      return n.reviewId != null ? `/review/${n.reviewId}` : null
    case 'SYSTEM':
      return null
  }
}

/**
 * 알림 페이지.
 *
 * - 첫 마운트 시 `getNotifications`로 첫 페이지 로드.
 * - `IntersectionObserver` 기반 무한 스크롤 + `nextCursor`로 후속 페이지 로딩 (HomeFeedPage 패턴 재사용).
 * - 항목 클릭 시 낙관적으로 `isRead=true` 처리 후 `markNotificationAsRead` 호출. 실패하면 롤백.
 * - 탭(전체/읽지 않음)은 클라이언트 측 필터링. 미읽음 탭은 이미 읽은 항목을 가린다.
 *
 * @remarks 폴링/SSE는 본 이슈 범위 밖. 사용자 진입 시 새로고침 정책으로 충분하다.
 */
export default function NotificationsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabValue>('all')

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  /**
   * 읽음 처리 PATCH 진행 중인 알림 ID 집합과 그 abort controller.
   *
   * [code-review MED fix] 같은 알림 연타 시 두 PATCH가 병렬로 가면 첫 실패의
   * 롤백 setState가 두 번째 성공을 덮어쓰는 race를 막기 위해 ID 단위로 in-flight
   * 가드. 또한 페이지 언마운트 시 모든 PATCH를 abort하여 unmount-after-setState
   * 경고를 방지한다.
   */
  const inFlightReadsRef = useRef<Set<number>>(new Set())
  const readControllersRef = useRef<Set<AbortController>>(new Set())

  const stateRef = useRef({ hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError })
  stateRef.current = { hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError }

  // 첫 페이지 로드. 마운트 시 1회. 페이지 이탈 시 in-flight 요청 취소.
  useEffect(() => {
    const controller = new AbortController()
    // ref 값이 cleanup 시점에 바뀔 수 있다는 ESLint 경고 회피 — 마운트 시점에
    // 캡처. Set 인스턴스 자체는 컴포넌트 생명주기 동안 동일 객체로 유지된다.
    const readControllers = readControllersRef.current
    const inFlightReads = inFlightReadsRef.current
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const response = await getNotifications(null, 20, controller.signal)
        if (controller.signal.aborted) return
        setNotifications(response.content)
        setNextCursor(response.nextCursor)
        setHasNext(response.hasNext)
        if (response.content.some(n => !n.isRead)) {
          markAllNotificationsAsRead()
            .then(() => {
              if (!controller.signal.aborted) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
              }
            })
            // read-all 실패는 무시 — 로컬은 미읽음으로 남고, 개별 클릭 시 read PATCH로 자연 복구된다
            .catch(() => {})
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '알림을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()
    return () => {
      controller.abort()
      moreControllerRef.current?.abort()
      // [code-review MED fix] 진행 중인 읽음 처리 PATCH도 함께 abort하여
      // unmount 후 롤백 setState가 발생하지 않도록 한다.
      readControllers.forEach(c => c.abort())
      readControllers.clear()
      inFlightReads.clear()
    }
  }, [])

  /**
   * 다음 페이지를 cursor로 추가 로딩한다.
   *
   * stateRef로 최신 상태를 안전하게 읽고, 진행 중인 이전 요청은 새 controller로 abort한다.
   * `loadMoreError` 발생 시 observer가 자동 재시도하지 않고 사용자가 명시적으로 retry.
   */
  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext || !s.nextCursor) return

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const response = await getNotifications(s.nextCursor, 20, controller.signal)
      if (controller.signal.aborted) return
      setNotifications(prev => [...prev, ...response.content])
      setNextCursor(response.nextCursor)
      setHasNext(response.hasNext)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [])

  /**
   * sentinel ref 콜백. 조건부로 렌더되는 sentinel의 마운트/언마운트에 따라 observer 재부착.
   */
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

  const retryLoadMore = () => {
    setLoadMoreError(null)
    fetchMore()
  }

  /**
   * 항목 클릭 핸들러. 낙관적으로 `isRead=true` 적용 후 백엔드 호출, 실패 시 롤백.
   *
   * [code-review MED fix]
   * - 같은 알림 ID에 PATCH가 이미 진행 중이면 새 호출을 스킵하여 race 방지.
   * - 롤백은 함수형 setState로 prev에서 해당 row를 다시 평가 — 다른 성공 호출이
   *   이미 true로 만든 결과를 덮어쓰지 않는다 (현재는 ID 가드로 동시 호출 자체가
   *   막히지만 안전망 차원에서 함수형 갱신 유지).
   * - 언마운트 시 전체 abort되도록 controller를 ref Set에 등록.
   * - signal을 markNotificationAsRead에 전달하여 abort 시 axios가 즉시 cancel.
   *
   * 이미 읽은 항목은 API 호출 없이 라우팅만 진행 (백엔드 멱등이지만 트래픽 절약).
   */
  const handleItemClick = async (n: NotificationItem) => {
    const destination = resolveDestination(n)

    if (n.isRead) {
      if (destination) navigate(destination)
      return
    }

    if (inFlightReadsRef.current.has(n.notificationId)) {
      if (destination) navigate(destination)
      return
    }

    inFlightReadsRef.current.add(n.notificationId)
    const controller = new AbortController()
    readControllersRef.current.add(controller)

    setNotifications(prev =>
      prev.map(item =>
        item.notificationId === n.notificationId ? { ...item, isRead: true } : item
      )
    )
    try {
      await markNotificationAsRead(n.notificationId, controller.signal)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      // 토스트 시스템이 없어 조용히 복원. 함수형 setState로 prev에서 다시 평가.
      setNotifications(prev =>
        prev.map(item =>
          item.notificationId === n.notificationId ? { ...item, isRead: false } : item
        )
      )
    } finally {
      inFlightReadsRef.current.delete(n.notificationId)
      readControllersRef.current.delete(controller)
    }
    if (destination) navigate(destination)
  }

  const unread = notifications.filter(n => !n.isRead)
  const read = notifications.filter(n => n.isRead)
  const displayed = activeTab === 'all' ? notifications : unread

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold tracking-tight text-primary">알림</h1>
          <div className="w-10" />
        </div>
        <div className="flex gap-6 px-4" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={cn(
              'border-b-2 pb-2 text-sm font-bold transition-colors',
              activeTab === 'all'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground'
            )}
          >
            전체
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unread'}
            onClick={() => setActiveTab('unread')}
            className={cn(
              'border-b-2 pb-2 text-sm font-medium transition-colors',
              activeTab === 'unread'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground'
            )}
          >
            읽지 않음
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {isLoading && notifications.length === 0 && (
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

        {!isLoading && !errorMessage && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
              notifications_off
            </span>
            <p className="text-sm text-muted-foreground">알림이 없습니다</p>
          </div>
        )}

        {notifications.length > 0 && activeTab === 'all' && (
          <>
            {unread.length > 0 && (
              <div className="bg-primary/5 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest">New</p>
                {unread.map(noti => (
                  <NotificationRow
                    key={noti.notificationId}
                    notification={noti}
                    onClick={handleItemClick}
                    highlighted
                  />
                ))}
              </div>
            )}
            {read.length > 0 && (
              <div className="px-4 py-3">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest">Earlier</p>
                {read.map(noti => (
                  <NotificationRow
                    key={noti.notificationId}
                    notification={noti}
                    onClick={handleItemClick}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {notifications.length > 0 && activeTab === 'unread' && (
          <div className="px-4 py-3">
            {displayed.length > 0 ? (
              displayed.map(noti => (
                <NotificationRow
                  key={noti.notificationId}
                  notification={noti}
                  onClick={handleItemClick}
                  highlighted
                />
              ))
            ) : hasNext || isLoadingMore ? (
              // [CodeRabbit fix] 클라이언트 측 필터(unread)라 첫 페이지가 모두 읽음이고 다음
              // 페이지에 미읽음이 있는 경우, 빈 상태를 보여주면서 동시에 sentinel이 백그라운드
              // 페이지를 가져오는 동작이 사용자에겐 "없다고 했다가 갑자기 생겨남"으로 혼란스럽다.
              // hasNext가 true이거나 추가 로딩 중이면 "확인 중" placeholder만 보여주고, 모든
              // 페이지를 다 본 뒤에야 진짜 빈 상태를 노출한다.
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <p role="status" aria-busy="true" className="text-sm text-muted-foreground">
                  읽지 않은 알림 확인 중...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                  notifications_off
                </span>
                <p className="text-sm text-muted-foreground">읽지 않은 알림이 없습니다</p>
              </div>
            )}
          </div>
        )}

        {notifications.length > 0 && (
          <>
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
                  onClick={retryLoadMore}
                  className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  다시 불러오기
                </button>
              </div>
            )}

            {!hasNext && !isLoadingMore && !loadMoreError && (
              <p className="py-4 text-center text-xs text-muted-foreground/50">
                모든 알림을 확인했습니다
              </p>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

/**
 * 알림 한 줄. 좌측 actor 아바타 + 우측 메시지/시간을 렌더링한다.
 *
 * - 좋아요/댓글/팔로우는 actor 정보 표시. 시스템 알림은 actor가 null이라 익명 아이콘.
 * - 클릭 시 부모 핸들러 호출(읽음 처리 + 라우팅).
 */
function NotificationRow({
  notification,
  onClick,
  highlighted = false,
}: {
  notification: NotificationItem
  onClick: (n: NotificationItem) => void
  highlighted?: boolean
}) {
  const icon = typeIcon[notification.type]
  const actorName = notification.actor?.nickname ?? '시스템'
  const message = buildNotificationMessage(notification)
  // [code-review LOW fix] SYSTEM 알림은 message 자체가 완결된 문장이라 actor 이름이
  // 앞에 붙으면 어색하다("시스템새로운 시스템 알림이 있습니다."). 시스템은 prefix 미노출.
  const showActorPrefix = notification.type !== 'SYSTEM'

  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={cn(
        'mb-3 flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors',
        highlighted ? 'bg-primary/10 shadow-sm' : 'hover:bg-primary/5'
      )}
    >
      <div className="relative shrink-0">
        <div className="size-12 overflow-hidden rounded-full border-2 border-card">
          {notification.actor?.profileImageUrl ? (
            <img
              src={notification.actor.profileImageUrl}
              alt={actorName}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-primary/10">
              <span className="material-symbols-outlined text-primary/40">person</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-card text-white',
            icon.bg
          )}
        >
          <span
            className={cn(
              'material-symbols-outlined text-[12px]',
              (notification.type === 'REVIEW_LIKE' || notification.type === 'COMMENT_LIKE') &&
                'fill-icon'
            )}
          >
            {icon.icon}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <p className="text-sm leading-snug">
          {showActorPrefix && <span className="font-bold">{actorName}</span>}
          {message}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {!notification.isRead && <div className="size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}
