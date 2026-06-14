import { memo } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import StarRating from './StarRating'

export interface BookListItemData {
  isbn: string
  title: string
  author: string
  publisher: string
  coverImageUrl: string
  pageCount?: number
  rating?: number
  reviewCount?: number
}

interface BookListItemProps {
  book: BookListItemData
  className?: string
}

function BookListItem({ book, className }: BookListItemProps) {
  return (
    <Link
      to={`/book/${book.isbn}`}
      className={cn('flex items-start gap-4 border-b border-primary/5 py-5', className)}
    >
      <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-primary/5 shadow-sm">
        <img
          src={book.coverImageUrl}
          alt={book.title}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-primary">{book.title}</h3>
        <p className="truncate text-sm text-muted-foreground">{book.author} 저</p>
        <p className="truncate text-xs text-muted-foreground/70">
          {book.publisher}
          {book.pageCount != null && ` · ${book.pageCount}p`}
        </p>
        {book.rating != null && (
          <div className="mt-auto flex items-center gap-1">
            <StarRating rating={book.rating} size="sm" />
            <span className="text-sm font-bold text-primary">{book.rating}</span>
            {book.reviewCount != null && (
              <span className="ml-1 text-xs text-muted-foreground">
                (리뷰 {book.reviewCount.toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

// 리스트에서 .map으로 다수 렌더되므로 props(book/className) 미변경 시 리렌더를 스킵한다.
export default memo(BookListItem)
