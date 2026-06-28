interface RecentKeywordsProps {
  keywords: string[]
  onSelect: (keyword: string) => void
  onRemove: (keyword: string) => void
  onClearAll: () => void
}

/**
 * 최근 검색어 칩 목록. 검색어가 비어있을 때만 노출하는 정책은 상위에서 결정한다.
 */
export default function RecentKeywords({
  keywords,
  onSelect,
  onRemove,
  onClearAll,
}: RecentKeywordsProps) {
  return (
    <div className="border-b border-border px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary/70">최근 검색어</h4>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-primary/40 hover:text-primary"
        >
          전체 삭제
        </button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
        {keywords.map(keyword => (
          <div
            key={keyword}
            className="flex h-8 shrink-0 items-center justify-center gap-x-1 rounded-full border border-primary/5 bg-primary/10 px-3"
          >
            <button
              type="button"
              onClick={() => onSelect(keyword)}
              className="text-sm font-medium leading-normal text-primary"
            >
              {keyword}
            </button>
            <button
              type="button"
              onClick={() => onRemove(keyword)}
              aria-label={`'${keyword}' 최근 검색어 삭제`}
            >
              <span className="material-symbols-outlined cursor-pointer text-[16px] text-primary/60">
                close
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
