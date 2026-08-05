import { create } from 'zustand'
import type { FeedCursor } from '@/api/feed'
import type { ReviewCardData } from '@/components/common/ReviewCard'

export interface FeedCache {
  items: ReviewCardData[]
  /** 다음 페이지 토큰(API 계층이 발급한 불투명 값). */
  nextCursor: FeedCursor | null
  hasNext: boolean
  scrollY: number
}

interface FeedState {
  feed: FeedCache | null
}

/**
 * 홈 피드 데이터를 컴포넌트 unmount 이후에도 메모리에 보존하는 스토어.
 * persist 미들웨어 없이 in-memory로만 유지 — 새로고침 시 자연스럽게 초기화.
 *
 * 팔로잉/추천이 하나의 피드로 합쳐지면서 탭별 캐시도 단일 캐시가 되었다.
 */
export const useFeedStore = create<FeedState>()(() => ({
  feed: null,
}))

export function setFeedCache(cache: FeedCache) {
  useFeedStore.setState({ feed: cache })
}

export function clearFeedCache() {
  useFeedStore.setState({ feed: null })
}
