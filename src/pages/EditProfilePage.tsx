import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import { updateProfile } from '@/api/member'
import { useAuthStore } from '@/store/authStore'

const NICKNAME_MAX = 50
const BIO_MAX = 300

const schema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '닉네임을 입력해주세요')
    .max(NICKNAME_MAX, `닉네임은 ${NICKNAME_MAX}자 이내로 입력해주세요`),
  bio: z.string().max(BIO_MAX, `자기소개는 ${BIO_MAX}자 이내로 입력해주세요`).optional(),
})

type FormData = z.infer<typeof schema>

export default function EditProfilePage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const setAuth = useAuthStore(state => state.setAuth)
  const accessToken = useAuthStore(state => state.accessToken)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nickname: user?.nickname ?? '',
      bio: user?.bio ?? '',
    },
  })

  const nickname = useWatch({ control, name: 'nickname' })
  const bio = useWatch({ control, name: 'bio' })

  const onSubmit = async (data: FormData) => {
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
      return
    }
    setErrorMessage(null)
    try {
      const result = await updateProfile({
        nickname: data.nickname,
        bio: data.bio?.trim(),
      })
      setAuth(
        {
          ...user,
          nickname: result.nickname,
          bio: result.bio,
          profileImageUrl: result.profileImageUrl ?? undefined,
        },
        accessToken
      )
      navigate('/profile', { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '프로필 수정에 실패했습니다.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        title="프로필 편집"
        showBack
        rightAction={
          <button
            type="submit"
            form="edit-profile-form"
            disabled={isSubmitting}
            className="text-base font-bold text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
          >
            {isSubmitting ? '저장 중...' : '저장'}
          </button>
        }
      />

      <main className="flex flex-1 flex-col px-6 pb-12 pt-8">
        {/* Profile Image */}
        <section className="mb-10 flex flex-col items-center">
          <div className="relative">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary/10 shadow-lg shadow-primary/10">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={`${user.nickname} 프로필 이미지`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-6xl text-muted-foreground/40">
                  person
                </span>
              )}
            </div>
            <button
              type="button"
              disabled
              aria-label="프로필 사진 변경 (준비 중)"
              className="absolute bottom-1 right-1 flex items-center justify-center rounded-full bg-primary/60 p-2 text-primary-foreground shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">photo_camera</span>
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">사진 변경은 추후 지원 예정입니다</p>
        </section>

        {/* Form */}
        <form id="edit-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Nickname */}
          <div className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <label htmlFor="edit-nickname" className="text-sm font-bold">
                닉네임
              </label>
              <span
                aria-live="polite"
                className={`text-xs ${(nickname?.length ?? 0) > NICKNAME_MAX ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {nickname?.length ?? 0}/{NICKNAME_MAX}
              </span>
            </div>
            <input
              id="edit-nickname"
              {...register('nickname')}
              type="text"
              maxLength={NICKNAME_MAX}
              placeholder="이름을 입력하세요"
              className="w-full rounded-xl border-none bg-card px-5 py-4 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
            />
            {errors.nickname && (
              <p role="alert" className="ml-1 text-xs text-destructive">
                {errors.nickname.message}
              </p>
            )}
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <label htmlFor="edit-bio" className="text-sm font-bold">
                자기소개
              </label>
              <span
                aria-live="polite"
                className={`text-xs ${(bio?.length ?? 0) > BIO_MAX ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {bio?.length ?? 0}/{BIO_MAX}
              </span>
            </div>
            <textarea
              id="edit-bio"
              {...register('bio')}
              maxLength={BIO_MAX}
              rows={4}
              placeholder="나의 서재를 소개해주세요"
              className="min-h-[120px] w-full resize-none rounded-xl border-none bg-card px-5 py-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
            />
            {errors.bio && (
              <p role="alert" className="ml-1 text-xs text-destructive">
                {errors.bio.message}
              </p>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <p
              role="alert"
              aria-atomic="true"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
