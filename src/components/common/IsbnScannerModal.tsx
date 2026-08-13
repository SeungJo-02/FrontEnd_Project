import { useCallback, useEffect, useRef, useState } from 'react'

import { createBarcodeDecoder } from '@/lib/barcodeDecoder'
import { isMobile } from '@/lib/device'
import Button from '@/components/ui/Button'
import Icon from '@/components/common/Icon'

const DEVICE_ID_KEY = 'shelfeed-scan-device-id'
const SCAN_INTERVAL = 120
// ROI를 디코딩 전 이 폭으로 축소한다. EAN-13(95모듈)엔 640px면 충분(≈6.7px/모듈)하고,
// 디코딩 대상 픽셀 수를 줄여 모바일 인식 속도를 크게 높인다.
const MAX_ROI_WIDTH = 640

type ScannerStatus =
  | 'initializing'
  | 'running'
  | 'detected'
  | 'denied'
  | 'no-camera'
  | 'in-use'
  | 'unsupported'
  | 'insecure-context'
  | 'error'

interface IsbnScannerModalProps {
  open: boolean
  onDetected: (isbn13: string) => void
  onClose: () => void
  // 인식된 ISBN-13의 체크섬 검증을 외부에서 주입 (프론트 검증 일관성 유지)
  validate?: (isbn13: string) => boolean
}

const STATUS_MESSAGES: Record<
  Exclude<ScannerStatus, 'initializing' | 'running' | 'detected'>,
  string
> = {
  denied: '카메라 권한이 필요합니다. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.',
  'no-camera': '이 기기에 사용할 수 있는 카메라가 없습니다.',
  'in-use': '다른 앱이 카메라를 사용 중입니다. 종료 후 다시 시도해주세요.',
  unsupported: '이 브라우저는 카메라 스캔을 지원하지 않습니다.',
  'insecure-context':
    '보안 연결(HTTPS)에서만 카메라를 사용할 수 있습니다. http:// 주소 대신 https:// 주소로 접속해주세요.',
  error: '카메라를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
}

const SCAN_TIPS = [
  { icon: 'crop_free', text: '바코드가 스캔 영역 안에 오도록 맞춰주세요' },
  { icon: 'light_mode', text: '조명이 밝은 곳에서 시도해주세요' },
  { icon: 'search', text: '바코드가 구겨지거나 가려지지 않았는지 확인해주세요' },
] as const

/**
 * 가이드 박스의 CSS 위치를 비디오 프레임 좌표로 역변환한다.
 *
 * video 요소가 `object-fit: cover`를 사용하므로, 실제 비디오 프레임의 일부가
 * 잘려서 표시된다. 화면상 가이드 박스 좌표를 원본 비디오 해상도 기준으로
 * 변환하여 정확한 크롭 영역을 계산한다.
 */
function computeROI(video: HTMLVideoElement): { sx: number; sy: number; sw: number; sh: number } {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return { sx: 0, sy: 0, sw: 0, sh: 0 }
  const cw = video.clientWidth
  const ch = video.clientHeight

  const scale = Math.max(cw / vw, ch / vh)
  const scaledW = vw * scale
  const scaledH = vh * scale
  const offsetX = (scaledW - cw) / 2
  const offsetY = (scaledH - ch) / 2

  // 가이드 박스 화면 좌표 (CSS와 동기화: inset-x-6 / sm:inset-x-1/4, aspect-[4/1])
  const isWide = cw >= 640
  const padX = isWide ? cw * 0.25 : 24
  const boxW = cw - padX * 2
  const boxH = boxW / 4
  const boxX = padX
  const boxY = (ch - boxH) / 2

  const sx = Math.round((boxX + offsetX) / scale)
  const sy = Math.round((boxY + offsetY) / scale)
  const sw = Math.round(boxW / scale)
  const sh = Math.round(boxH / scale)

  return {
    sx: Math.max(0, sx),
    sy: Math.max(0, sy),
    sw: Math.min(sw, vw - Math.max(0, sx)),
    sh: Math.min(sh, vh - Math.max(0, sy)),
  }
}

export default function IsbnScannerModal({
  open,
  onDetected,
  onClose,
  validate,
}: IsbnScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // ZXing이 stop() 직후 1~2 프레임 더 콜백을 호출할 수 있어, 첫 인식 후 후속 호출을 잠금으로 차단
  const detectedRef = useRef(false)
  // 첫 인식 → onDetected 사이의 시각 피드백 지연 타이머. 모달 닫힘 시 반드시 clear (다음 오픈에 stale fire 방지)
  const detectionTimerRef = useRef<number | null>(null)
  // startStream의 await 진행 중에 cleanup이 끼어들면 이후 단계를 stale로 판정해 자기 산출물을 직접 정리
  const sessionRef = useRef(0)
  const scanTimerRef = useRef<number | null>(null)

  const [status, setStatus] = useState<ScannerStatus>('initializing')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [flashFeedback, setFlashFeedback] = useState(false)
  const [tipIndex, setTipIndex] = useState(-1)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const torchOnRef = useRef(false)

  // ZXing 콜백에 stable closure를 넘기기 위한 ref. 부모 리렌더로 onDetected가 새로 와도
  // 스캔 루프 콜백은 항상 최신 핸들러를 호출 (stale closure 방지)
  const onDetectedRef = useRef(onDetected)
  const validateRef = useRef(validate)
  useEffect(() => {
    onDetectedRef.current = onDetected
    validateRef.current = validate
  }, [onDetected, validate])

  // 모든 자원 정리. cleanup 누락 시 LED가 켜진 상태로 유지되는 흔한 버그 방지
  const stopAll = useCallback(() => {
    sessionRef.current += 1 // 진행 중인 startStream을 stale로 표시
    if (detectionTimerRef.current != null) {
      window.clearTimeout(detectionTimerRef.current)
      detectionTimerRef.current = null
    }
    if (scanTimerRef.current != null) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    torchOnRef.current = false
    setTorchOn(false)
    setTorchAvailable(false)
  }, [])

  const handleDetected = useCallback(
    (isbn: string) => {
      if (detectedRef.current) return // 같은 세션의 후속 콜백 — 첫 인식만 통과
      const validator = validateRef.current
      if (validator && !validator(isbn)) return // 체크섬 불일치 → 계속 스캔
      detectedRef.current = true
      setStatus('detected')
      setFlashFeedback(true)
      setTipIndex(-1)
      navigator.vibrate?.(50)
      stopAll()
      // 시각 피드백을 위해 짧게 지연
      detectionTimerRef.current = window.setTimeout(() => {
        detectionTimerRef.current = null
        onDetectedRef.current(isbn)
      }, 200)
    },
    [stopAll]
  )

  const handleTorchToggle = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOnRef.current
      // 네이티브 트랙 제약으로 토치 제어 — zxing 의존 없이 동작(미지원 시 catch로 무시)
      await track.applyConstraints({ advanced: [{ torch: next }] })
      torchOnRef.current = next
      setTorchOn(next)
    } catch {
      // 토치 제어 실패 — 무시
    }
  }, [])

  const startStream = useCallback(
    async (deviceId: string | null) => {
      const mySession = ++sessionRef.current
      const isStale = () => sessionRef.current !== mySession

      try {
        // getUserMedia는 보안 컨텍스트(HTTPS / localhost)에서만 노출된다. 폰에서 개발 서버를
        // http://192.168.x.x 로 열면 navigator.mediaDevices 자체가 undefined가 되는데, 이때
        // '브라우저 미지원'으로 안내하면 원인을 영영 못 찾는다. 두 경우를 갈라서 알려준다.
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
          setStatus('insecure-context')
          return
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus('unsupported')
          return
        }

        // 기존 스트림 정지 후 새 요청
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                // @ts-expect-error focusMode는 TS 타입 미반영, ideal이므로 미지원 시 무시됨
                focusMode: { ideal: 'continuous' },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: { ideal: 'continuous' },
              },
        }

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (err) {
          // 저장된 deviceId가 더 이상 유효하지 않음(USB 분리 등) → facingMode 폴백 후 재시도
          if (
            err instanceof DOMException &&
            err.name === 'OverconstrainedError' &&
            deviceId != null
          ) {
            try {
              localStorage.removeItem(DEVICE_ID_KEY)
            } catch {
              // private 모드 등 — 무시
            }
            // 재귀 호출 — 새 sessionRef 토큰으로 처음부터
            return startStream(null)
          }
          throw err
        }

        if (isStale()) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach(t => t.stop())
          streamRef.current = null
          return
        }
        video.srcObject = stream

        // 권한 받은 직후 enumerate (라벨 포함)
        const all = await navigator.mediaDevices.enumerateDevices()
        if (isStale()) return
        const videoInputs = all.filter(d => d.kind === 'videoinput')
        setDevices(videoInputs)

        // 실제 사용 중인 deviceId 추출 → state/localStorage 동기화
        const trackSettings = stream.getVideoTracks()[0]?.getSettings()
        const usingId = trackSettings?.deviceId ?? null

        // 저장된 deviceId가 전면 카메라면(구버전에서 선택돼 localStorage에 남은 경우 등) 후면으로 폴백.
        // 전면은 드롭다운(후면만 노출)에 없어 사용자가 되돌릴 수 없으므로, 잘못된 저장값을 지우고
        // facingMode: environment로 재요청한다. deviceId != null 조건이라 재귀는 1회로 끝난다.
        if (deviceId != null && trackSettings?.facingMode === 'user') {
          try {
            localStorage.removeItem(DEVICE_ID_KEY)
          } catch {
            // private 모드 등 — 무시
          }
          stream.getTracks().forEach(t => t.stop())
          streamRef.current = null
          return startStream(null)
        }

        setActiveDeviceId(usingId)
        if (usingId) {
          try {
            localStorage.setItem(DEVICE_ID_KEY, usingId)
          } catch {
            // private 모드 등에서 실패 시 무시
          }
        }

        // 토치 지원 감지 (네이티브 트랙 capability — zxing 의존 제거)
        try {
          const caps = stream.getVideoTracks()[0]?.getCapabilities?.()
          setTorchAvailable(!!caps?.torch)
        } catch {
          setTorchAvailable(false)
        }

        // 네이티브 BarcodeDetector(안드로이드 등) 우선, 미지원 시 zxing 폴백.
        // zxing은 폴백 경로에서만 동적 import되어 네이티브 환경의 번들 비용을 없앤다.
        const decoder = await createBarcodeDecoder()
        if (isStale()) return

        // 가이드 박스 영역만 크롭할 offscreen canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          stopAll()
          setStatus('error')
          return
        }

        // 이전에는 ZXing decodeFromVideoElement 내부에서 play()를 처리했으나 수동 루프에서는 명시 호출
        await video.play()
        if (isStale()) return

        /**
         * ROI 크롭 + 다운스케일 수동 디코딩 루프.
         *
         * 가이드 박스 영역만 canvas에 크롭하되 MAX_ROI_WIDTH로 축소해 디코딩 대상
         * 픽셀 수를 줄인다(모바일 인식 속도의 핵심). 전체 프레임을 디코딩하면 주변
         * 노이즈로 인식률이 떨어지고, 원본 해상도 그대로면 모바일 CPU에서 느리다.
         * decode는 비동기(네이티브 detect)일 수 있어 await 직후 stale/detected를
         * 재확인해 모달 닫힘 시 타이머 누수를 막는다.
         */
        const scanLoop = async () => {
          if (isStale() || detectedRef.current) return
          try {
            const { sx, sy, sw, sh } = computeROI(video)
            if (sw > 0 && sh > 0) {
              const targetW = Math.min(sw, MAX_ROI_WIDTH)
              const targetH = Math.max(1, Math.round(sh * (targetW / sw)))
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW
                canvas.height = targetH
              } else {
                ctx.clearRect(0, 0, targetW, targetH)
              }
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH)
              const text = await decoder.decode(canvas)
              if (isStale() || detectedRef.current) return
              if (text) {
                handleDetected(text)
                return
              }
            }
          } catch {
            // video not ready / decode 내부 예외 — 다음 프레임 재시도
          }
          scanTimerRef.current = window.setTimeout(() => void scanLoop(), SCAN_INTERVAL)
        }
        scanTimerRef.current = window.setTimeout(() => void scanLoop(), SCAN_INTERVAL)

        setStatus('running')
      } catch (error) {
        if (isStale()) return // stale 호출의 에러는 표시 안 함
        // 실패 지점까지 할당됐을 수 있는 stream/video.srcObject를 정리해 카메라 LED를 즉시 끔
        stopAll()
        if (!(error instanceof DOMException)) {
          setStatus('error')
          return
        }
        switch (error.name) {
          case 'NotAllowedError':
          case 'SecurityError':
            setStatus('denied')
            break
          case 'NotFoundError':
          case 'OverconstrainedError':
            setStatus('no-camera')
            break
          case 'NotReadableError':
          case 'TrackStartError':
            setStatus('in-use')
            break
          case 'AbortError':
            // 사용자가 dismiss 또는 컴포넌트 unmount — 조용히 무시
            break
          default:
            setStatus('error')
        }
      }
    },
    [handleDetected, stopAll]
  )

  // effect deps 폭주(부모 리렌더 → onDetected 새 참조 → handleDetected/startStream 재생성 → 카메라 재시작) 방지를 위해
  // startStream/stopAll을 ref에 보관하고 effect는 [open]에만 의존
  const startStreamRef = useRef(startStream)
  const stopAllRef = useRef(stopAll)
  useEffect(() => {
    startStreamRef.current = startStream
    stopAllRef.current = stopAll
  }, [startStream, stopAll])

  // 모달 열림 시 시작
  useEffect(() => {
    if (!open) return
    // 다음 오픈을 위해 잠금 해제 — 새 세션 시작
    detectedRef.current = false
    setStatus('initializing')
    setFlashFeedback(false)

    let saved: string | null = null
    try {
      saved = localStorage.getItem(DEVICE_ID_KEY)
    } catch {
      saved = null
    }
    startStreamRef.current(saved)

    return () => {
      stopAllRef.current()
    }
  }, [open])

  // 인식 실패 시 단계적 도움말 타이머
  useEffect(() => {
    if (!open || status !== 'running') {
      setTipIndex(-1)
      return
    }
    const timers = [
      window.setTimeout(() => setTipIndex(0), 5000),
      window.setTimeout(() => setTipIndex(1), 10000),
      window.setTimeout(() => setTipIndex(2), 15000),
    ]
    return () => timers.forEach(t => window.clearTimeout(t))
  }, [open, status])

  // 사용자가 드롭다운에서 카메라 변경
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    // 기존 스트림/디코더/타이머 모두 정리 후 새 세션으로 시작
    stopAll()
    detectedRef.current = false
    setActiveDeviceId(id)
    setStatus('initializing')
    startStream(id)
  }

  if (!open) return null

  const errorMessage =
    status === 'denied' ||
    status === 'no-camera' ||
    status === 'in-use' ||
    status === 'unsupported' ||
    status === 'error'
      ? STATUS_MESSAGES[status]
      : null

  // 빈 deviceId(권한 직후 일부 브라우저)는 select key/value 충돌 방지 위해 제외
  const selectableDevices = devices.filter(d => d.deviceId)
  // 모바일은 환경모드 기본 후면이 인식 최선이라 선택 UI를 노출하지 않는다(다른 렌즈는 오히려 나쁨).
  // 데스크탑만 웹캠 위치/화질 비교용으로 선택 제공.
  const showDeviceSelect = !isMobile() && selectableDevices.length >= 2 && status === 'running'

  const currentTip = tipIndex >= 0 ? SCAN_TIPS[tipIndex] : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ISBN 바코드 스캔"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="스캐너 닫기"
          className="flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
        >
          <Icon name="close" />
        </button>
        <h2 className="flex-1 text-center text-base font-bold">ISBN 바코드 스캔</h2>
        <div className="flex items-center gap-2">
          {torchAvailable && status === 'running' && (
            <button
              type="button"
              onClick={handleTorchToggle}
              aria-label={torchOn ? '플래시 끄기' : '플래시 켜기'}
              aria-pressed={torchOn}
              className={`flex size-10 items-center justify-center rounded-full transition-colors ${
                torchOn ? 'bg-yellow-500/30 text-yellow-300' : 'text-white hover:bg-white/10'
              }`}
            >
              <Icon name={torchOn ? 'flashlight_on' : 'flashlight_off'} />
            </button>
          )}
          {showDeviceSelect ? (
            <select
              aria-label="카메라 선택"
              value={activeDeviceId ?? ''}
              onChange={handleDeviceChange}
              className="max-w-[40vw] truncate rounded-md bg-white/10 px-2 py-1 text-xs text-white outline-none"
            >
              {selectableDevices.map((d, idx) => (
                <option key={d.deviceId} value={d.deviceId} className="text-black">
                  {d.label || `카메라 ${idx + 1}`}
                </option>
              ))}
            </select>
          ) : (
            <span className="size-10" aria-hidden="true" />
          )}
        </div>
      </header>

      {/* Video / Error / Loading */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden="true"
          className="size-full object-cover"
        />

        {/* 가이드 박스 + 외부 마스크 (status가 running일 때만) */}
        {status === 'running' && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 sm:inset-x-1/4">
              <div
                className={`relative aspect-[4/1] overflow-hidden rounded-lg transition-colors ${
                  flashFeedback ? 'bg-emerald-500/30' : ''
                }`}
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }}
              >
                {/* 모서리 마커 */}
                <span className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-emerald-400" />
                <span className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-emerald-400" />
                <span className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-emerald-400" />
                <span className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-emerald-400" />
                {/* 스캔 라인 */}
                <span className="absolute inset-x-2 top-0 h-0.5 animate-[scan_1.6s_ease-in-out_infinite] bg-red-500" />
              </div>
              {currentTip ? (
                <div className="mt-4 animate-[tip-fade-in_0.3s_ease-out] text-center">
                  <div className="mb-1 flex items-center justify-center gap-1.5">
                    <Icon name={currentTip.icon} className="text-base text-amber-400" />
                    <p className="text-sm font-medium text-amber-300">{currentTip.text}</p>
                  </div>
                  {tipIndex >= 2 && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="pointer-events-auto mt-3 rounded-xl bg-white/90 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-white"
                    >
                      직접 ISBN 입력하기
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-6 text-center text-sm font-medium text-white/90">
                  책 뒷면 바코드를 스캔 영역에 맞춰주세요
                </p>
              )}
            </div>
          </div>
        )}

        {(status === 'initializing' || status === 'detected') && !errorMessage && (
          <p
            role="status"
            aria-busy={status === 'initializing'}
            className="absolute text-sm text-white/80"
          >
            {status === 'initializing' ? '카메라 준비 중...' : '인식 완료'}
          </p>
        )}

        {errorMessage && (
          <div className="absolute inset-x-0 top-1/2 mx-6 -translate-y-1/2 rounded-2xl bg-white/95 p-6 text-center text-foreground">
            <Icon name="error" className="mb-2 text-4xl text-destructive" />
            <p role="alert" className="mb-4 text-sm font-medium">
              {errorMessage}
            </p>
            <Button onClick={onClose}>직접 입력하기</Button>
          </div>
        )}
      </div>

      {/* Footer fallback */}
      {!errorMessage && (
        <footer className="bg-black/80 px-4 py-3 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            직접 입력하기
          </button>
        </footer>
      )}

      {/* keyframes는 인라인 style 태그로 — Tailwind 3.x animate-[...] 임의값 동작 보장 */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0.9; }
          50% { transform: translateY(calc(100% - 4px)); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.9; }
        }
        @keyframes tip-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
