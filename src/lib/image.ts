/** 허용 이미지 MIME 접두사 — 파일 선택 후 실제 타입을 한 번 더 확인한다. */
const IMAGE_MIME_PREFIX = 'image/'

/** 리사이즈 전 원본 파일 크기 상한(10MB). 초과 시 디코딩 시도 없이 즉시 거절한다. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export class ImageProcessingError extends Error {}

/**
 * 이미지 파일을 정사각으로 center-crop + 축소해 JPEG data URL로 만든다.
 *
 * 전용 업로드 엔드포인트가 없어 프로필 이미지를 data URL 문자열로 보내야 하므로,
 * 원본을 그대로 실으면 요청이 수 MB로 불어난다. 짧은 변 기준으로 잘라 `maxSize`까지
 * 줄이고 JPEG로 다시 인코딩해 크기를 억제한다.
 *
 * @throws {ImageProcessingError} 이미지가 아니거나, 너무 크거나, 디코딩에 실패한 경우
 */
export async function fileToSquareDataUrl(
  file: File,
  maxSize = 512,
  quality = 0.85
): Promise<string> {
  if (!file.type.startsWith(IMAGE_MIME_PREFIX)) {
    throw new ImageProcessingError('이미지 파일만 선택할 수 있습니다.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageProcessingError('10MB 이하의 이미지를 선택해주세요.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)

    // 짧은 변 기준 정사각 crop — 인물 사진에서 얼굴이 잘리지 않도록 가운데를 취한다.
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    if (side === 0) throw new ImageProcessingError('이미지를 읽을 수 없습니다.')
    const sx = (image.naturalWidth - side) / 2
    const sy = (image.naturalHeight - side) / 2
    const target = Math.min(side, maxSize)

    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageProcessingError('이미지를 처리할 수 없습니다.')

    ctx.drawImage(image, sx, sy, side, side, 0, 0, target, target)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ImageProcessingError('이미지를 불러오지 못했습니다.'))
    image.src = src
  })
}
