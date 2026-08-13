import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { searchBooks, type BookSummary } from '@/api/book'
import { getMyProfile } from '@/api/member'
import type { Genre } from '@/api/genre'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import { keywordsFor } from './genreKeywords'
import Icon from '@/components/common/Icon'

/** 한 번에 보여줄 추천 책 수. 가로 스크롤 한 화면에 적당한 양. */
const BOOK_COUNT = 8
/** 무작위로 고를 검색 페이지 범위. 너무 뒤로 가면 결과가 비어 1페이지로 되돌아온다. */
const PAGE_RANGE = 4

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** 두 목록이 같은 책을 같은 순서로 담고 있는지. */
function isSameBooks(a: BookSummary[], b: BookSummary[]): boolean {
  return a.length === b.length && a.every((book, i) => book.bookId === b[i].bookId)
}

/**
 * 관심 장르 중 하나를 골라 그 장르의 책을 가져온다.
 *
 * 장르·검색어·페이지를 매번 다시 뽑아, 화면을 볼 때마다 다른 책이 걸리도록 한다.
 * 항상 첫 장르·첫 페이지만 보면 여러 장르를 골라둔 의미도 없고 화면이 늘 똑같다.
 */
async function loadRecommendedBooks(
  genres: Genre[],
  signal: AbortSignal
): Promise<{ genre: Genre; books: BookSummary[] }> {
  const genre = pickRandom(genres)
  const keyword = pickRandom(keywordsFor(genre.name))
  const page = 1 + Math.floor(Math.random() * PAGE_RANGE)

  const result = await searchBooks(keyword, BOOK_COUNT, page, signal)
  if (result.content.length > 0) return { genre, books: result.content }

  // 뒤쪽 페이지에는 결과가 없을 수 있다 — 빈손으로 두지 말고 첫 페이지로 되돌아간다.
  const firstPage = await searchBooks(keyword, BOOK_COUNT, 1, signal)
  return { genre, books: firstPage.content }
}

/**
 * 피드에 보여줄 감상이 하나도 없을 때의 첫 방문 화면.
 *
 * 갓 가입한 사용자는 팔로우한 사람이 없어 피드가 비는데, "감상이 없어요" 한 줄만
 * 띄우면 여기서 할 수 있는 게 없다. 온보딩에서 고른 관심 장르로 책을 찾아 보여주고
 * 감상 쓰기·사람 찾기로 이어준다.
 *
 * 책 추천은 장르 이름을 검색어로 쓰는 어림짐작이다. 서버가 관심 장르 기반 추천 감상을
 * 내려주기 시작하면(`docs/통합_피드_API_명세.md`) 피드 자체가 채워지므로 이 화면은
 * 감상이 정말 없을 때만 남는다.
 */
export default function EmptyFeedGuide() {
  const [genres, setGenres] = useState<Genre[]>([])
  /** 지금 보여주는 책들을 고른 장르. */
  const [genre, setGenre] = useState<Genre | null>(null)
  const [books, setBooks] = useState<BookSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isShuffling, setIsShuffling] = useState(false)

  /** 진행 중인 "다른 책" 요청. 연타하면 앞의 요청을 버린다. */
  const shuffleControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const profile = await getMyProfile(controller.signal)
        if (controller.signal.aborted) return
        setGenres(profile.genres)

        // 관심 장르가 없으면(온보딩을 건너뛴 계정) 책 추천 없이 안내만 보여준다.
        if (profile.genres.length === 0) return

        const picked = await loadRecommendedBooks(profile.genres, controller.signal)
        if (controller.signal.aborted) return
        setGenre(picked.genre)
        setBooks(picked.books)
      } catch (error) {
        // 추천은 덤이다. 실패해도 아래 안내와 버튼은 그대로 쓸 수 있어야 하므로 조용히 넘어간다.
        if (axios.isCancel(error) || controller.signal.aborted) return
        if (import.meta.env.DEV) console.error('[EmptyFeedGuide] 추천 책 조회 실패', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      shuffleControllerRef.current?.abort()
    }
  }, [])

  const handleShuffle = useCallback(async () => {
    if (genres.length === 0) return

    shuffleControllerRef.current?.abort()
    const controller = new AbortController()
    shuffleControllerRef.current = controller
    setIsShuffling(true)

    try {
      let picked = await loadRecommendedBooks(genres, controller.signal)
      if (controller.signal.aborted) return

      // 장르가 하나뿐이거나 같은 페이지를 다시 뽑으면 화면이 그대로라 버튼이 고장난 것처럼 보인다.
      // 한 번만 더 뽑아 본다 — 책이 적은 장르에서는 결국 같을 수 있으므로 반복하지는 않는다.
      if (isSameBooks(picked.books, books)) {
        picked = await loadRecommendedBooks(genres, controller.signal)
        if (controller.signal.aborted) return
      }

      setGenre(picked.genre)
      setBooks(picked.books)
    } catch (error) {
      // 실패하면 보고 있던 책을 그대로 둔다 — 빈 화면으로 바뀌는 게 더 나쁘다.
      if (axios.isCancel(error) || controller.signal.aborted) return
      if (import.meta.env.DEV) console.error('[EmptyFeedGuide] 추천 책 갱신 실패', error)
    } finally {
      if (!controller.signal.aborted) setIsShuffling(false)
    }
  }, [genres, books])

  if (isLoading) {
    return <EmptyState icon="auto_stories" message="피드를 준비하고 있어요..." />
  }

  return (
    <div className="px-4 pb-6 pt-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Icon name="auto_stories" className="text-5xl text-muted-foreground/30" />
        <h2 className="text-lg font-bold">아직 피드가 비어 있어요</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          마음에 드는 사람을 팔로우하거나
          <br />첫 감상을 남기면 이곳이 채워집니다.
        </p>
      </div>

      {books.length > 0 && genre && (
        <section className="mt-8" aria-labelledby="empty-feed-books">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="empty-feed-books" className="text-sm font-bold">
                <span className="text-primary">{genre.name}</span> 좋아하시죠?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">관심 장르로 찾아본 책이에요.</p>
            </div>

            <button
              type="button"
              onClick={handleShuffle}
              disabled={isShuffling}
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <Icon name="refresh" className={cn('text-base', isShuffling && 'animate-spin')} />
              다른 책
            </button>
          </div>

          {/* 카드가 화면 밖으로 이어지는 걸 보여주려 가로 스크롤로 둔다. */}
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {books.map(book => (
              <li key={book.bookId} className="w-24 shrink-0 snap-start">
                <Link to={`/book/${book.bookId}`} className="block">
                  {book.coverImageUrl ? (
                    <img
                      src={book.coverImageUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-full rounded-lg object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-muted">
                      <Icon name="menu_book" className="text-2xl text-muted-foreground/40" />
                    </div>
                  )}
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-4">{book.title}</p>
                  <p className="line-clamp-1 text-2xs text-muted-foreground">{book.author}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-col gap-2">
        {/* 감상은 책에 딸리므로 빈손으로 작성 화면에 보내지 않고 책부터 고르게 한다. */}
        <Link
          to="/search?tab=book"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-md font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Icon name="edit_note" className="text-xl" />첫 감상 쓰기
        </Link>
        <Link
          to="/search?tab=user"
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3.5 text-md font-bold transition-colors hover:bg-primary/5"
        >
          <Icon name="person_search" className="text-xl" />
          함께 읽을 사람 찾기
        </Link>
      </div>

      {genres.length === 0 && (
        <Link
          to="/settings/genres"
          className="mt-4 block text-center text-xs text-muted-foreground underline underline-offset-4"
        >
          관심 장르를 고르면 취향에 맞는 책을 보여드려요
        </Link>
      )}
    </div>
  )
}
