import { useLocation, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import Icon, { type IconName } from '@/components/common/Icon'

const navItems: { label: string; icon: IconName; path: string }[] = [
  { label: '홈', icon: 'home', path: '/' },
  { label: '검색', icon: 'search', path: '/search' },
  { label: '내 서재', icon: 'menu_book', path: '/library' },
  { label: '프로필', icon: 'person', path: '/profile' },
]

export default function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-border bg-card/95 px-4 pb-6 pt-2 backdrop-blur-md">
      <div className="flex items-center justify-around">
        {navItems.map(item => {
          const isActive = pathname === item.path

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon name={item.icon} className="text-2xl" filled={isActive} />
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
