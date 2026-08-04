import { useEffect } from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import Icon from '@/components/common/Icon'

/**
 * 라우트 단위 `errorElement`.
 *
 * 라우트 element 렌더 중 발생한 예외나 매칭 실패(존재하지 않는 경로 → 404 ErrorResponse)를
 * React Router가 포착해 이 컴포넌트로 렌더한다. 루트 레이아웃 라우트에 부여하면 모든 하위
 * 라우트의 에러와 미매칭 경로(catch-all 404)를 한곳에서 처리한다.
 *
 * @remarks 전역 ErrorBoundary(main.tsx)와 달리 라우팅 컨텍스트가 살아 있어 `<Link>`로
 *          앱 내 복구 이동이 가능하다.
 */
export default function RouteError() {
  const error = useRouteError()

  // 로깅은 렌더 부수효과를 피해 effect에서 처리한다(StrictMode 이중 렌더 시 중복 로깅 방지).
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error('RouteError가 에러를 포착했습니다:', error)
    }
  }, [error])

  const is404 = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Icon name={is404 ? 'search_off' : 'error'} className="text-5xl text-muted-foreground" />
      <h1 className="text-lg font-bold text-foreground">
        {is404 ? '페이지를 찾을 수 없습니다' : '문제가 발생했습니다'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {is404
          ? '요청하신 페이지가 존재하지 않거나 이동되었습니다.'
          : '예상치 못한 오류로 화면을 표시할 수 없습니다.'}
      </p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
      >
        홈으로 가기
      </Link>
    </div>
  )
}
