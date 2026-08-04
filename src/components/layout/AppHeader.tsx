import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import Icon from '@/components/common/Icon'

interface AppHeaderProps {
  title?: string
  showBack?: boolean
  rightAction?: React.ReactNode
  className?: string
}

export default function AppHeader({
  title = 'Shelfeed',
  showBack = false,
  rightAction,
  className,
}: AppHeaderProps) {
  const navigate = useNavigate()
  const isHomeLogo = title === 'Shelfeed'

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md',
        className
      )}
    >
      <div className="flex w-10 items-center">
        {showBack && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="이전 페이지로 돌아가기"
            className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <Icon name="arrow_back" />
          </button>
        )}
      </div>

      {/*
        로고는 heading이자 홈 이동 링크다. h1에 role="link"를 얹으면 heading/link 시맨틱이
        충돌하므로, 홈 로고일 때만 h1 안에 네이티브 <Link>를 중첩해 키보드/SR 접근을 확보한다.
        (헤더엔 다른 인터랙티브가 없어 중첩 문제 없음)
      */}
      <h1 className={cn('text-xl font-bold tracking-tight text-primary', !showBack && 'text-2xl')}>
        {isHomeLogo ? (
          <Link to="/" className="transition-opacity hover:opacity-70">
            {title}
          </Link>
        ) : (
          title
        )}
      </h1>

      <div className="flex w-10 items-center justify-end">{rightAction}</div>
    </header>
  )
}
