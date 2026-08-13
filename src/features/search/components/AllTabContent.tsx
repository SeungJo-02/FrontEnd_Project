import { Link } from 'react-router-dom'
import UserSearchCard from '@/components/common/UserSearchCard'
import type { BookSearchItem, UserSearchItem } from '@/api/search'
import StatusMessage from '@/components/ui/StatusMessage'
import Icon from '@/components/common/Icon'

interface AllTabContentProps {
  isLoading: boolean
  errorMessage: string | null
  books: BookSearchItem[]
  users: UserSearchItem[]
  booksHasMore: boolean
  usersHasMore: boolean
  previewCount: number
  onJumpToBookTab: () => void
  onJumpToUserTab: () => void
  onCommit: () => void
}

/**
 * 전체 탭 — books/users 두 섹션을 미리보기 N건씩 렌더하고 "더 보기" 클릭 시
 * 해당 탭으로 점프. 페이징은 도서/유저 탭에서만 수행 (UX 단순화).
 */
export default function AllTabContent({
  isLoading,
  errorMessage,
  books,
  users,
  booksHasMore,
  usersHasMore,
  previewCount,
  onJumpToBookTab,
  onJumpToUserTab,
  onCommit,
}: AllTabContentProps) {
  if (isLoading && books.length === 0 && users.length === 0) {
    return <StatusMessage tone="loading">검색 중...</StatusMessage>
  }

  if (!isLoading && errorMessage) {
    return <StatusMessage tone="error">{errorMessage}</StatusMessage>
  }

  if (!isLoading && books.length === 0 && users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="search_off" className="text-5xl text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      </div>
    )
  }

  const previewBooks = books.slice(0, previewCount)
  const previewUsers = users.slice(0, previewCount)
  const showBookMoreButton = booksHasMore || books.length >= previewCount
  const showUserMoreButton = usersHasMore || users.length >= previewCount

  return (
    <div className="flex flex-col gap-4 py-2">
      {previewBooks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-primary">도서 ({books.length}건)</h2>
          <div className="flex flex-col">
            {previewBooks.map(book => (
              <Link
                key={book.bookId}
                to={`/book/${book.bookId}`}
                onClick={onCommit}
                className="flex items-start gap-4 border-b border-primary/5 py-4"
              >
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-primary/5 shadow-sm">
                  {book.coverImageUrl ? (
                    <img
                      src={book.coverImageUrl}
                      alt={book.title}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Icon name="menu_book" className="text-xl text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="line-clamp-2 text-base font-bold leading-tight text-primary">
                    {book.title}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                  {book.reviewCount > 0 && (
                    <p className="text-xs text-muted-foreground/70">
                      ★ {book.averageRating.toFixed(1)} · 감상 {book.reviewCount}개
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          {showBookMoreButton && (
            <button
              type="button"
              onClick={onJumpToBookTab}
              className="mt-2 w-full rounded-lg bg-primary/5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              도서 검색 결과 전체 보기
            </button>
          )}
        </section>
      )}

      {previewUsers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-primary">유저 ({users.length}건)</h2>
          <div className="flex flex-col">
            {previewUsers.map(user => (
              <UserSearchCard key={user.userId} user={user} />
            ))}
          </div>
          {showUserMoreButton && (
            <button
              type="button"
              onClick={onJumpToUserTab}
              className="mt-2 w-full rounded-lg bg-primary/5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              유저 검색 결과 전체 보기
            </button>
          )}
        </section>
      )}
    </div>
  )
}
