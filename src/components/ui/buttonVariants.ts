import { cva } from 'class-variance-authority'

/**
 * 버튼 스타일 정의.
 *
 * 컴포넌트 파일과 분리해 둔 이유는 두 가지다.
 * 1) `<Button>`을 쓸 수 없는 자리(예: 버튼처럼 보이는 `<Link>`)에서 스타일만 빌려 쓰려고
 * 2) 한 파일이 컴포넌트와 상수를 함께 내보내면 Fast Refresh가 동작하지 않아서
 *
 * 각 variant는 새로 만든 모양이 아니라 코드에 이미 여러 번 등장하던 조합 그대로다:
 * `primary`(9곳), `soft`(11곳).
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        soft: 'bg-primary/10 font-medium text-primary hover:bg-primary/20',
        outline: 'border-2 border-primary/40 bg-background text-primary hover:bg-primary/5',
        ghost: 'text-primary hover:bg-primary/5',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        sm: 'rounded-lg px-4 py-2 text-sm',
        md: 'rounded-xl px-6 py-3 text-sm',
        lg: 'h-14 rounded-full px-6 text-base',
        full: 'h-14 w-full rounded-full text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)
