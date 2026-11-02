// 오른쪽 패널의 영상 칸 하나(나 또는 친구 한 명).
export function createTile(container, {id, name, self}) {
  const el = document.createElement('div')
  el.className = self ? 'tile is-self' : 'tile'
  el.dataset.peer = id

  const video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.muted = Boolean(self) // 내 소리를 내가 다시 들으면 울린다

  const off = document.createElement('div')
  off.className = 'tile-off'
  off.textContent = '영상 없음'

  const label = document.createElement('span')
  label.className = 'tile-name'

  el.append(video, off, label)
  container.append(el)

  const tile = {
    el,
    video,
    hasVideo: false,
    camOn: true,
    setName(text, micOn = true) {
      label.textContent = micOn ? text : `${text} · 음소거`
    },
    setStream(stream) {
      video.srcObject = stream
      tile.hasVideo = stream.getVideoTracks().length > 0
      tile.refresh()
    },
    setCamOn(on) {
      tile.camOn = on
      tile.refresh()
    },
    refresh() {
      off.hidden = tile.hasVideo && tile.camOn
      off.textContent = tile.hasVideo ? '카메라 꺼짐' : '영상 없음'
    },
    setVolume(volume) {
      if (self) return
      video.volume = volume
      el.classList.toggle('is-far', volume === 0)
    },
    remove() {
      video.srcObject = null
      el.remove()
    },
  }
  tile.setName(name)
  tile.refresh()
  return tile
}
