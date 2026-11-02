// 카메라+마이크 → 안 되면 마이크만 → 그것도 안 되면 없이 입장한다.
export async function getLocalMedia() {
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) return {stream: null, note: '이 브라우저는 마이크·카메라를 지원하지 않아요.'}
  try {
    const stream = await md.getUserMedia({audio: true, video: {width: 640, height: 480}})
    return {stream, note: ''}
  } catch {
    try {
      const stream = await md.getUserMedia({audio: true, video: false})
      return {stream, note: '카메라 없이 마이크만 켰어요.'}
    } catch {
      return {stream: null, note: '마이크·카메라 없이 들어왔어요. 브라우저 주소창의 권한 설정에서 허용할 수 있어요.'}
    }
  }
}

export function startScreenCapture() {
  return navigator.mediaDevices.getDisplayMedia({video: true, audio: true})
}

export function setTracksEnabled(tracks, enabled) {
  for (const track of tracks) track.enabled = enabled
}
