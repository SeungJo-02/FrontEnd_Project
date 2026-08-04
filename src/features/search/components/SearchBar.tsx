import type { SearchType } from '@/features/search/types'
import Icon from '@/components/common/Icon'

interface SearchBarProps {
  value: string
  activeTab: SearchType
  onChange: (value: string) => void
  onEnter: () => void
  onScanClick: () => void
}

/**
 * 통합 검색 입력창. 도서/전체 탭에서는 바코드 스캐너 진입 버튼을 노출한다.
 * ISBN 감지 시 자동으로 도서 탭으로 전환되는 동작은 상위에서 처리.
 */
export default function SearchBar({
  value,
  activeTab,
  onChange,
  onEnter,
  onScanClick,
}: SearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onEnter()
    }
  }

  return (
    <div className="border-b border-border px-4 py-3" role="search">
      <label htmlFor="book-search-input" className="sr-only">
        통합 검색
      </label>
      <div className="flex h-12 w-full items-stretch rounded-xl border border-primary/10 bg-primary/5">
        <div className="flex items-center justify-center pl-4 text-primary/60">
          <Icon name="search" className="text-[22px]" />
        </div>
        <input
          id="book-search-input"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="도서 또는 유저 검색"
          placeholder={
            activeTab === 'user'
              ? '닉네임으로 유저 검색'
              : activeTab === 'book'
                ? '도서 제목, 저자, ISBN 검색'
                : '도서 또는 유저 검색'
          }
          className="h-full min-w-0 flex-1 border-none bg-transparent px-3 text-base font-normal outline-none placeholder:text-primary/40 focus:ring-0"
        />
        {/* 바코드 스캐너: 도서/전체 탭에서 표시. ISBN 감지 시 자동으로 도서 탭 전환 */}
        {(activeTab === 'book' || activeTab === 'all') && (
          <button
            type="button"
            onClick={onScanClick}
            aria-label="바코드 스캔으로 ISBN 검색"
            className="flex items-center justify-center pr-4 text-primary transition-colors hover:text-primary/70"
          >
            <Icon name="barcode_scanner" className="text-[24px]" />
          </button>
        )}
      </div>
    </div>
  )
}
