import type { ReadingStatus } from '@/api/library'
import type { IconName } from '@/components/common/Icon'

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

/**
 * 독서 상태의 표시 정보 단일 출처 — 라벨·부연 설명·아이콘.
 *
 * 상태 선택 시트(카드)와 도서 상세의 상태 칩이 같은 이름·같은 아이콘을 쓰도록 모아둔다.
 * 예전엔 시트는 SVG 아이콘, 칩은 이모지를 따로 들고 있어 같은 상태가 다르게 보였다.
 */
export const READING_STATUS_META: Record<
  ReadingStatus,
  { label: string; description: string; icon: IconName }
> = {
  finished: { label: '읽은 책', description: '다 읽었어요', icon: 'status_finished' },
  reading: { label: '읽고 있는 책', description: '열심히 읽고 있어요', icon: 'status_reading' },
  want_to_read: { label: '읽고 싶은 책', description: '찜 해두고 싶어요', icon: 'status_want' },
  stopped: { label: '중단한 책', description: '더 읽지 않을래요', icon: 'status_stopped' },
}

/** 상태 선택 시트에 노출되는 순서 — 첨부 디자인과 동일. */
export const READING_STATUS_ORDER: ReadingStatus[] = [
  'finished',
  'reading',
  'want_to_read',
  'stopped',
]
