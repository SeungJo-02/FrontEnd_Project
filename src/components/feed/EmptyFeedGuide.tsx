import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { searchBooks, type BookSummary } from '@/api/book'
import { getMyProfile } from '@/api/member'
import type { Genre } from '@/api/genre'
import Icon from '@/components/common/Icon'
import { EmptyState } from '@/components/common/EmptyState'

/** 한 번에 보여줄 추천 책 수. 가로 스크롤 한 화면에 적당한 양. */
const BOOK_COUNT = 8

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
  const [books, setBooks] = useState<BookSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const profile = await getMyProfile(controller.signal)
        if (controller.signal.aborted) return
        setGenres(profile.genres)

        // 관심 장르가 없으면(온보딩을 건너뛴 계정) 책 추천 없이 안내만 보여준다.
        if (profile.genres.length === 0) return

        // 여러 장르를 한 번에 검색할 방법이 없어 첫 장르만 쓴다. 고른 순서가 곧 우선순위.
        const result = await searchBooks(profile.genres[0].name, BOOK_COUNT, 1, controller.signal)
        if (controller.signal.aborted) return
        setBooks(result.content)
      } catch (error) {
        // 추천은 덤이다. 실패해도 아래 안내와 버튼은 그대로 쓸 수 있어야 하므로 조용히 넘어간다.
        if (axios.isCancel(error) || controller.signal.aborted) return
        if (import.meta.env.DEV) console.error('[EmptyFeedGuide] 추천 책 조회 실패', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

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

      {books.length > 0 && (
        <section className="mt-8" aria-labelledby="empty-feed-books">
          <h3 id="empty-feed-books" className="text-sm font-bold">
            <span className="text-primary">{genres[0].name}</span> 좋아하시죠?
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">관심 장르로 찾아본 책이에요.</p>

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
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{book.author}</p>
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
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-[15px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Icon name="edit_note" className="text-xl" />첫 감상 쓰기
        </Link>
        <Link
          to="/search?tab=user"
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3.5 text-[15px] font-bold transition-colors hover:bg-primary/5"
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
