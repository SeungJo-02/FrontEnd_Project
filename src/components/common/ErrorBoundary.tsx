import { Component, type ErrorInfo, type ReactNode } from 'react'
import Button from '@/components/ui/Button'
import Icon from '@/components/common/Icon'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * 앱 전역 React 에러 경계.
 *
 * 렌더 단계에서 던져진 예외가 트리 전체를 언마운트(화이트스크린)시키는 것을 막고,
 * 사용자에게 복구 가능한 fallback UI('다시 시도')를 제공한다. `RouterProvider` 바깥
 * (`main.tsx`)을 감싸 라우팅 자체나 Provider 단계의 예외까지 최후 방어선으로 포착한다.
 *
 * @remarks 라우트 element 렌더 예외는 React Router의 `errorElement`(RouteError)가 1차로
 *          처리하므로, 이 경계는 그 바깥의 예외를 담당한다. 프로덕션 에러 리포팅(Sentry 등)
 *          연동 시 `componentDidCatch`를 진입점으로 사용한다.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary가 예외를 포착했습니다:', error, info)
    }
    // TODO(후속): 프로덕션 에러 리포팅 서비스 연동 지점
  }

  private handleReload = () => {
    // 현재 URL을 그대로 재요청해 딥링크/복구 컨텍스트를 보존한다('다시 시도' 라벨과 일치).
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Icon name="error" className="text-5xl text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">문제가 발생했습니다</h1>
        <p className="text-sm text-muted-foreground">
          예상치 못한 오류로 화면을 표시할 수 없습니다. 잠시 후 다시 시도해주세요.
        </p>
        <Button
          className="mt-2 transition-transform active:scale-[0.98]"
          onClick={this.handleReload}
        >
          다시 시도
        </Button>
      </div>
    )
  }
}
