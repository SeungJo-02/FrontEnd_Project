import type { ReadingStatus } from '@/api/library'

/** 서재 필터 값 — 독서 상태 또는 '전체'. */
export type LibraryFilterValue = ReadingStatus | 'all'

/**
 * 서재 필터 탭 목록. MyLibraryPage / UserLibraryPage가 공유한다.
 * (이전엔 두 페이지에 동일 정의가 중복돼 있어 단일 출처로 통합)
 */
export const LIBRARY_FILTERS: { label: string; value: LibraryFilterValue }[] = [
  { label: '전체', value: 'all' },
  { label: '읽고 싶은', value: 'want_to_read' },
  { label: '읽는 중', value: 'reading' },
  { label: '다 읽음', value: 'finished' },
  { label: '중단', value: 'stopped' },
]

/**
 * 도서 카드 상태 뱃지 텍스트 + 배경색 매핑. MyLibraryPage / UserLibraryPage가 공유한다.
 */
export const LIBRARY_STATUS_BADGE: Record<ReadingStatus, { text: string; bg: string }> = {
  finished: { text: '다 읽음', bg: 'bg-primary' },
  reading: { text: '읽는 중', bg: 'bg-amber-600' },
  want_to_read: { text: '읽고 싶은', bg: 'bg-primary/40' },
  stopped: { text: '중단', bg: 'bg-slate-400' },
}
