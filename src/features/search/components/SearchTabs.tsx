import { cn } from '@/lib/utils'
import { TABS, type SearchType } from '@/features/search/types'

interface SearchTabsProps {
  activeTab: SearchType
  onChange: (tab: SearchType) => void
}

/** 전체/도서/유저 탭 셀렉터. */
export default function SearchTabs({ activeTab, onChange }: SearchTabsProps) {
  return (
    <div className="border-b border-border" role="tablist">
      <div className="flex">
        {TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex-1 border-b-2 py-3 text-sm font-bold transition-colors',
              activeTab === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
