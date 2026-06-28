/**
 * 인증/프로필 폼 입력칸 공통 스타일.
 * Login·Signup·EditProfile·비밀번호(변경/재설정/요청)·Withdraw 등에서 동일하게 사용.
 * 라벨/에러 표시 래퍼는 화면마다 달라 컴포넌트화하지 않고 className만 공유한다.
 */
export const FORM_INPUT_CLASS =
  'w-full rounded-xl border-none bg-card px-5 py-4 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20'
