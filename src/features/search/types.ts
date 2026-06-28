import type { BookDetail, BookSummary } from '@/api/book'
import type { SearchType } from '@/api/search'

export type { SearchType }

/** 전체 탭 미리보기 노출 건수 (도서/유저 각각). */
export const ALL_TAB_PREVIEW_COUNT = 5

/** 검색어 입력 debounce 지연 (ms). */
export const SEARCH_DEBOUNCE_MS = 400

/** 도서/유저 탭 페이지 크기. */
export const SEARCH_PAGE_SIZE = 20

export const TABS: { value: SearchType; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'book', label: '도서' },
  { value: 'user', label: '유저' },
]

export function isSearchType(value: string | null): value is SearchType {
  return value === 'all' || value === 'book' || value === 'user'
}

/** 검색 조회 에러를 사용자 메시지 문자열로 변환한다. */
export function toSearchErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

const ISBN13_REGEX = /^97[89]\d{10}$/

// EAN-13 체크섬: 1*d0 + 3*d1 + 1*d2 + 3*d3 ... + d12 = 0 (mod 10)
export function isValidIsbn13(value: string): boolean {
  if (!ISBN13_REGEX.test(value)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) {
    const digit = Number(value[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return sum % 10 === 0
}

// 도서 상세(BookDetail)를 검색 결과 카드(BookSummary)와 시각적으로 통일
export function isbnResultToSummary(book: BookDetail): BookSummary {
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
