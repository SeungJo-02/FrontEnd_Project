import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { followUser, unfollowUser } from '@/api/follow'
import type { UserSearchItem } from '@/api/search'
import { useAuthStore } from '@/store/authStore'

/**
 * 통합 검색 결과의 유저 카드. 클릭 시 `/user/{userId}` 프로필로 이동, 팔로우 토글
 * 버튼은 자기 자신이 아닌 경우에만 노출.
 *
 * **낙관적 업데이트 + 롤백**:
 * `isFollowing`/`followerCount`를 즉시 반영 후 백엔드 호출. 실패 시 원래 값으로 롤백.
 *
 * **카드 클릭과 토글 버튼 분리**:
 * 카드 전체가 `<Link>`라 토글 버튼 onClick에서 `e.preventDefault()` + `e.stopPropagation()`
 * 으로 라우팅을 막는다. 이렇게 안 하면 토글 클릭이 상위 `<Link>`로 버블링되어 의도하지
 * 않게 프로필로 이동.
 *
 * **연타/언마운트 가드**:
 * `isProcessing`으로 진행 중이면 새 토글 차단(API는 멱등이지만 race 방지).
 * 언마운트 후 setState 방지를 위해 `isMountedRef` 유지.
 */
export default function UserSearchCard({ user }: { user: UserSearchItem }) {
  const myUserId = useAuthStore(state => state.user?.id)
  const isMe = myUserId === user.userId

  const [isFollowing, setIsFollowing] = useState(user.isFollowing)
  const [followerCount, setFollowerCount] = useState(user.followerCount)
  const [isProcessing, setIsProcessing] = useState(false)

  const isMountedRef = useRef(true)
  // [code-review HIGH fix] StrictMode 더블 인보크 + 진짜 unmount를 모두 처리.
  // setup에서 true로 리셋해 ref가 false로 stuck되는 것을 방지하고, cleanup에서
  // 명시적으로 false로 두어 unmount 후 setState 경고를 막는다.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // [code-review MED fix] 부모 prop이 갱신될 때(다른 화면에서 팔로우 토글 후
  // 검색 결과로 재진입, 무한 스크롤 dedup 미적용 시 같은 userId 재출현 등) 본
  // 카드의 내부 state도 동기화. 외부 변경이 카드에 반영되지 않는 stale UI 방지.
  useEffect(() => {
    setIsFollowing(user.isFollowing)
    setFollowerCount(user.followerCount)
  }, [user.userId, user.isFollowing, user.followerCount])

  const handleToggleFollow = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (isProcessing) return

    const wasFollowing = isFollowing
    // 낙관적 업데이트
    setIsFollowing(!wasFollowing)
    setFollowerCount(prev => prev + (wasFollowing ? -1 : 1))
    setIsProcessing(true)

    try {
      const result = wasFollowing ? await unfollowUser(user.userId) : await followUser(user.userId)
      if (!isMountedRef.current) return
      // 서버 권위적 카운트로 동기화 (낙관적 +/-1과 다를 수 있음)
      if (Number.isFinite(result.followerCount)) {
        setFollowerCount(result.followerCount)
      }
    } catch {
      if (!isMountedRef.current) return
      // 실패 시 원래 값으로 롤백
      setIsFollowing(wasFollowing)
      setFollowerCount(prev => prev + (wasFollowing ? 1 : -1))
    } finally {
      if (isMountedRef.current) setIsProcessing(false)
    }
  }

  return (
    <Link
      to={`/user/${user.userId}`}
      className="flex items-center gap-3 border-b border-primary/5 py-4"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-full bg-primary/10">
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt={`${user.nickname} 프로필 이미지`}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="material-symbols-outlined text-primary/40">person</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{user.nickname}</p>
        {user.bio && <p className="line-clamp-1 text-xs text-muted-foreground">{user.bio}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground/70">팔로워 {followerCount}</p>
      </div>

      {!isMe && (
        <button
          type="button"
          onClick={handleToggleFollow}
          disabled={isProcessing}
          aria-pressed={isFollowing}
          className={
            isFollowing
              ? 'shrink-0 rounded-full border border-primary/30 bg-card px-4 py-1.5 text-xs font-bold text-primary disabled:opacity-60'
              : 'shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60'
          }
        >
          {isFollowing ? '팔로잉' : '팔로우'}
        </button>
      )}
    </Link>
  )
}
