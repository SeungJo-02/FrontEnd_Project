import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteMemo, getMemos, type BookMemo } from '@/lib/memoStore'
import Icon from '@/components/common/Icon'

type MemoSort = 'recent' | 'oldest'

interface BookMemoTabProps {
  bookId: number
}

/**
 * 도서 상세의 메모 탭.
 *
 * 메모는 서버가 아니라 이 브라우저에만 저장된다(`@/lib/memoStore`). 목록/정렬/삭제만
 * 담당하고, 작성·수정은 별도 화면(`/book/:bookId/memo`)으로 넘긴다.
 */
export default function BookMemoTab({ bookId }: BookMemoTabProps) {
  const navigate = useNavigate()
  const [memos, setMemos] = useState<BookMemo[]>([])
  const [sort, setSort] = useState<MemoSort>('recent')

  // 작성 화면에서 돌아오면 목록을 다시 읽는다(localStorage는 구독이 없어 마운트 시 로드).
  useEffect(() => {
    setMemos(getMemos(bookId))
  }, [bookId])

  const sorted =
    sort === 'recent' ? memos : [...memos].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

  const handleDelete = (memoId: string) => {
    if (!window.confirm('이 메모를 삭제하시겠습니까?')) return
    deleteMemo(bookId, memoId)
    setMemos(getMemos(bookId))
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setSort(prev => (prev === 'recent' ? 'oldest' : 'recent'))}
          className="flex items-center gap-1 text-sm font-semibold text-foreground/80"
        >
          {sort === 'recent' ? '최신 저장일순' : '오래된 순'}
          <Icon
            name={sort === 'recent' ? 'arrow_drop_down' : 'arrow_drop_up'}
            className="text-[18px]"
          />
        </button>

        <button
          type="button"
          onClick={() => navigate(`/book/${bookId}/memo`)}
          className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
        >
          <Icon name="add" className="text-[18px]" />
          작성하기
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <Icon name="sticky_note_2" className="text-[64px] text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">아직 작성한 메모가 없어요.</p>
          <p className="text-sm text-muted-foreground/70">작성하기를 눌러 메모를 남겨보세요.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map(memo => (
            <li key={memo.id} className="rounded-2xl bg-card p-4 shadow-sm">
              {memo.imageDataUrl && (
                <img
                  src={memo.imageDataUrl}
                  alt=""
                  className="mb-3 max-h-48 w-full rounded-xl object-cover"
                />
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {memo.content}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {new Date(memo.updatedAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => navigate(`/book/${bookId}/memo/${memo.id}`)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(memo.id)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] leading-5 text-muted-foreground/60">
        메모는 이 기기의 브라우저에만 저장됩니다.
      </p>
    </div>
  )
}
