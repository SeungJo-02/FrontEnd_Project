import { useCallback, useEffect, useRef, useState } from 'react'

type CameraStatus =
  | 'initializing'
  | 'running'
  | 'denied'
  | 'no-camera'
  | 'in-use'
  | 'unsupported'
  | 'error'

const STATUS_MESSAGES: Record<Exclude<CameraStatus, 'initializing' | 'running'>, string> = {
  denied: '카메라 권한이 필요합니다. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.',
  'no-camera': '이 기기에 사용할 수 있는 카메라가 없습니다.',
  'in-use': '다른 앱이 카메라를 사용 중입니다. 종료 후 다시 시도해주세요.',
  unsupported: '이 브라우저는 카메라를 지원하지 않습니다.',
  error: '카메라를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
}

// sessionStorage에 저장 — 공용 PC에서 카메라 deviceId가 영구 잔존하지 않도록 탭 세션으로 한정.
const DEVICE_ID_KEY = 'shelfeed-ocr-device-id'

interface WebcamCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
}

/**
 * PC 환경에서 웹캠 라이브 프리뷰를 보여주고 촬영하는 전체 화면 모달.
 *
 * IsbnScannerModal의 getUserMedia/에러 처리/cleanup/디바이스 선택 패턴을 간소화하여 재활용한다.
 * 바코드 스캔·토치 로직은 제거하고 프리뷰 + 촬영 버튼 + 카메라 선택만 제공.
 */
export default function WebcamCapture({ onCapture, onClose }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionRef = useRef(0)
  const [status, setStatus] = useState<CameraStatus>('initializing')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const stopAll = useCallback(() => {
    sessionRef.current += 1
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startStream = useCallback(
    async (deviceId: string | null) => {
      const mySession = ++sessionRef.current
      const isStale = () => sessionRef.current !== mySession

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus('unsupported')
          return
        }

        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        }

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (err) {
          if (
            err instanceof DOMException &&
            err.name === 'OverconstrainedError' &&
            deviceId != null
          ) {
            try {
              sessionStorage.removeItem(DEVICE_ID_KEY)
            } catch {
              /* private mode */
            }
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

        const all = await navigator.mediaDevices.enumerateDevices()
        if (isStale()) return
        const videoInputs = all.filter(d => d.kind === 'videoinput')
        setDevices(videoInputs)

        const trackSettings = stream.getVideoTracks()[0]?.getSettings()
        const usingId = trackSettings?.deviceId ?? null
        setActiveDeviceId(usingId)
        if (usingId) {
          try {
            sessionStorage.setItem(DEVICE_ID_KEY, usingId)
          } catch {
            /* private mode */
          }
        }

        await video.play()
        if (isStale()) return

        setStatus('running')
      } catch (error) {
        if (isStale()) return
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
            break
          default:
            setStatus('error')
        }
      }
    },
    [stopAll]
  )

  const startStreamRef = useRef(startStream)
  const stopAllRef = useRef(stopAll)
  useEffect(() => {
    startStreamRef.current = startStream
    stopAllRef.current = stopAll
  }, [startStream, stopAll])

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(DEVICE_ID_KEY)
    } catch {
      saved = null
    }
    startStreamRef.current(saved)
    return () => stopAllRef.current()
  }, [])

  const handleDeviceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value
      stopAll()
      setStatus('initializing')
      startStream(id)
    },
    [stopAll, startStream]
  )

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.9))
    stopAll()
  }, [stopAll])

  const handleConfirmCapture = useCallback(async () => {
    if (!capturedImage) return
    try {
      const res = await fetch(capturedImage)
      const blob = await res.blob()
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
      onCapture(file)
    } catch {
      setCapturedImage(null)
      setStatus('error')
    }
  }, [capturedImage, onCapture])

  const handleRetake = useCallback(() => {
    setCapturedImage(null)
    startStream(activeDeviceId)
  }, [startStream, activeDeviceId])

  const handleClose = useCallback(() => {
    stopAll()
    onClose()
  }, [stopAll, onClose])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [handleClose])

  const errorMessage =
    status !== 'initializing' && status !== 'running' ? STATUS_MESSAGES[status] : null

  const selectableDevices = devices.filter(d => d.deviceId)
  const showDeviceSelect = selectableDevices.length >= 2 && status === 'running' && !capturedImage

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="카메라 촬영"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3 text-white">
        <button
          type="button"
          onClick={handleClose}
          aria-label="카메라 닫기"
          className="flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <h2 className="flex-1 text-center text-base font-bold">카메라 촬영</h2>
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
      </header>

      {capturedImage ? (
        <>
          {/* Captured Image Preview */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <img
              loading="lazy"
              src={capturedImage}
              alt="촬영된 사진"
              className="size-full object-contain"
            />
          </div>

          {/* Confirm / Retake */}
          <footer className="flex items-center justify-center gap-6 bg-black/80 px-4 py-6">
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center gap-2 rounded-xl border-2 border-white/60 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
              다시 촬영
            </button>
            <button
              type="button"
              onClick={handleConfirmCapture}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
              보내기
            </button>
          </footer>
        </>
      ) : (
        <>
          {/* Video Preview */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-hidden="true"
              className="size-full object-cover"
            />

            {status === 'initializing' && (
              <p role="status" aria-busy="true" className="absolute text-sm text-white/80">
                카메라 준비 중...
              </p>
            )}

            {errorMessage && (
              <div className="absolute inset-x-0 top-1/2 mx-6 -translate-y-1/2 rounded-2xl bg-white/95 p-6 text-center text-foreground">
                <span className="material-symbols-outlined mb-2 text-4xl text-destructive">
                  error
                </span>
                <p role="alert" className="mb-4 text-sm font-medium">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
                >
                  닫기
                </button>
              </div>
            )}
          </div>

          {/* Capture Button */}
          {status === 'running' && (
            <footer className="flex items-center justify-center bg-black/80 px-4 py-6">
              <button
                type="button"
                onClick={handleCapture}
                aria-label="촬영하기"
                className="flex size-[72px] items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90"
              >
                <span className="size-[56px] rounded-full bg-white" />
              </button>
            </footer>
          )}

          {!errorMessage && status !== 'running' && (
            <footer className="bg-black/80 px-4 py-3 text-center">
              <button
                type="button"
                onClick={handleClose}
                className="text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                취소
              </button>
            </footer>
          )}
        </>
      )}
    </div>
  )
}
