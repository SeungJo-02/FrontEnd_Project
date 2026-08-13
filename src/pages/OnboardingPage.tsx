import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { isCarouselSeen, markCarouselSeen } from '@/lib/onboarding'
import { useAuthStore } from '@/store/authStore'
import { Screen } from '@/components/layout/Screen'
import Icon, { type IconName } from '@/components/common/Icon'

const slides = [
  {
    icon: 'edit_note' as IconName,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA7enhEnhcx8YWljYpT8Vudf4W8uAVcLys7deYrBP0afc_vDj27OxwqlftknWjVM-1eU8n97McbEndElSeuhyyT_WHqS4xzMOCPzs4X6yxQOhShLZIMx_3aF0NWWZnY9RqrTgQ2e3q-0o123viCBgt-hpA_C1-hWjgzVR0_4K3-BiR4ELR7jH4mlpxtluLr3WVLkGSqCGMdBKa6WFUEMo2lLkJsyPMNwN7ms_7JxEvPypcVNJaWgF4etggvPbEeKxpSSZ4Jvatw4jg',
    imageAlt: 'Person reading and taking notes in a cozy room',
    title: (
      <>
        읽은 책의 감상을
        <br />
        자유롭게 기록하세요
      </>
    ),
    description: '독서의 여정을 나만의 문장으로 남겨보세요.',
  },
  {
    icon: 'group' as IconName,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBdblZxxqMYhebPIhkQ5qCLKZwiIL3Wi0e5xwG3ilfyC9zCpGZYMkmgv9_sr6jyAEpWP9qggFl5RMlFUTjwcGC4HMDx9vrdUpGFC1h2vvSURaFJVRYZWeNWfutVNXp5UtxFILQaZg5JkZyD7Bpbr77K4Ok88bquh4iaEBtxQpycG6sNq7aX4kPj2qlY0ZmN-5KsQSQ9qF-ujtUjdh5AKdmE26sJ3vKPKgqxNsNm81IxgPvUU7Y1j_psfmrfXYTkdBzpnjMumEN6ahM',
    imageAlt: 'Friends discussing books in a cozy cafe',
    title: (
      <>
        다른 독자들의
        <br />
        솔직한 감상을 만나보세요
      </>
    ),
    description: '진솔한 독서 이야기를 나눠보세요.',
  },
  {
    icon: 'bar_chart' as IconName,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDWo4_8_d-585jy3PSac9A7r3pbnaM2o5Yn_UNr6LpIzV8CWpP2COEkUF3vYNAfoEMqiVWlng3lKygqOfc7TQvbUYkSQF0apm17PupSVEOoHw5O_jt2xSEv3CpgkuIxmV6-boIpPrGqjQd-8YuuUAtUGty9_n9E87ZajGlpXGT2SXyvTGChclDXenY8nRnXoydqfB1Mwi1vf6lXuFLUtFWlpjFPJbS-PoHSYfunscdC7zg3lRqzvC08oIfFklbDzSlZdTJDW_ai9WF2',
    imageAlt: 'A warm-toned photograph of a tall stack of books on a rustic wooden desk',
    title: <>나만의 독서 통계를 확인하세요</>,
    description: '읽은 책이 쌓일수록 성장하는 나를 만나보세요.',
  },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const onboardingCompleted = useAuthStore(state => state.user?.onboardingCompleted)

  if (isCarouselSeen()) {
    return <Navigate to={onboardingCompleted ? '/' : '/onboarding/genre'} replace />
  }

  /**
   * 캐러셀 완료 후 localStorage에 "봤음" 플래그를 저장하고,
   * onboardingCompleted(백엔드) 값에 따라 장르 선택 또는 홈으로 분기.
   * 캐시 초기화 시 localStorage가 지워지므로 캐러셀이 다시 노출된다.
   */
  const finishCarousel = () => {
    markCarouselSeen()
    navigate(onboardingCompleted ? '/' : '/onboarding/genre', { replace: true })
  }

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep(prev => prev + 1)
    } else {
      finishCarousel()
    }
  }

  const current = slides[step]
  const isLastStep = step === slides.length - 1

  return (
    <Screen className="text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between p-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Shelfeed</h1>
        <button onClick={finishCarousel} className="text-sm font-medium text-primary/60">
          건너뛰기
        </button>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mx-auto w-full max-w-md space-y-8">
          {/* Illustration */}
          <div className="w-full">
            <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-primary/5">
              <img
                src={current.imageUrl}
                alt={current.imageAlt}
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-80 mix-blend-multiply"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              <div className="relative z-10 flex flex-col items-center">
                <Icon name={current.icon} filled className="mb-4 text-7xl text-primary" />
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="space-y-4 text-center">
            <h2 className="text-3xl font-bold leading-tight">{current.title}</h2>
            <p className="text-lg text-muted-foreground">{current.description}</p>
          </div>

          {/* Pagination Dots */}
          <div className="flex items-center justify-center gap-2 py-4">
            {slides.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  index === step ? 'w-6 bg-primary' : 'w-2.5 bg-primary/20'
                )}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Bottom CTA */}
      <footer className="mx-auto w-full max-w-md p-6">
        <button
          onClick={handleNext}
          className="w-full rounded-xl bg-primary py-5 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
        >
          {isLastStep ? '시작하기' : '다음'}
        </button>
        <div className="h-4" />
      </footer>
    </Screen>
  )
}
