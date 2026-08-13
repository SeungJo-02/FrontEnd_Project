import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { buttonVariants } from './buttonVariants'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/**
 * 앱 전역 버튼. 모양은 `buttonVariants`에서 가져온다.
 * 예외적인 크기·모양은 `className`으로 덮어쓴다(tailwind-merge가 뒤에 온 값을 남긴다).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      // 폼 안에서 의도치 않게 submit되지 않도록 기본을 button으로 둔다.
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export default Button
