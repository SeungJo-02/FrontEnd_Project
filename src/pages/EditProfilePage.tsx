import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import { updateProfile } from '@/api/member'
import { useAuthStore } from '@/store/authStore'
import { FORM_INPUT_CLASS } from '@/constants/form'
import { fileToSquareDataUrl, ImageProcessingError } from '@/lib/image'
import { Avatar } from '@/components/common/Avatar'
import { Screen } from '@/components/layout/Screen'
import FieldError from '@/components/ui/FieldError'
import ErrorBox from '@/components/ui/ErrorBox'
import Icon from '@/components/common/Icon'

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
  /** 새로 고른 사진의 data URL. null이면 기존 사진을 유지한다. */
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const previewImageUrl = pendingImage ?? user?.profileImageUrl ?? null

  const handlePickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 같은 파일을 다시 골라도 change가 발생하도록 값을 비운다.
    event.target.value = ''
    if (!file) return

    setErrorMessage(null)
    setIsProcessingImage(true)
    try {
      setPendingImage(await fileToSquareDataUrl(file))
    } catch (error) {
      setErrorMessage(
        error instanceof ImageProcessingError
          ? error.message
          : '이미지를 처리하지 못했습니다. 다른 사진을 선택해주세요.'
      )
    } finally {
      setIsProcessingImage(false)
    }
  }

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
        // 사진을 새로 고른 경우에만 전송한다. 전용 업로드 엔드포인트가 없어
        // 리사이즈한 data URL을 그대로 profileImageUrl로 보낸다.
        ...(pendingImage ? { profileImageUrl: pendingImage } : {}),
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
    <Screen>
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
              <Avatar
                src={previewImageUrl}
                alt={`${user?.nickname ?? ''} 프로필 이미지`}
                name={user?.nickname}
                className="h-full w-full"
                iconClassName="text-6xl text-muted-foreground/40"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePickImage}
              className="sr-only"
              aria-label="프로필 사진 파일 선택"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImage}
              aria-label="프로필 사진 변경"
              className="absolute bottom-1 right-1 flex items-center justify-center rounded-full bg-primary p-2 text-primary-foreground shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              <Icon
                name={isProcessingImage ? 'hourglass_top' : 'photo_camera'}
                className="text-[20px]"
              />
            </button>
          </div>

          {pendingImage ? (
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="mt-3 text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              선택한 사진 취소
            </button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              사진을 눌러 프로필 이미지를 변경하세요
            </p>
          )}
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
              className={FORM_INPUT_CLASS}
            />
            {errors.nickname && <FieldError message={errors.nickname.message} />}
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
            {errors.bio && <FieldError message={errors.bio.message} />}
          </div>

          {/* Error Message */}
          {errorMessage && <ErrorBox message={errorMessage} />}
        </form>
      </main>
    </Screen>
  )
}
