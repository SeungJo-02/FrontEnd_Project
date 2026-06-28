import type { SearchType } from '@/features/search/types'

/**
 * 검색 화면을 벗어났다가 URL 쿼리 없이(예: 하단 네비 탭) 재진입할 때 직전 검색어/탭을
 * 복원하기 위한 in-memory 세션 기록. persist 없이 메모리로만 유지 — 새로고침 시 초기화.
 *
 * (검색 "결과" 캐시는 React Query가 보유하므로, 본 모듈은 검색어/활성 탭만 기억한다.)
 */
export const searchSession: { query: string; activeTab: SearchType } = {
  query: '',
  activeTab: 'all',
}
