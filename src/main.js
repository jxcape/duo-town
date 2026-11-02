import {selfId, readRoomFromHash, createRoomHash, connectRoom} from './net.js'
import {getLocalMedia, startScreenCapture, setTracksEnabled} from './media.js'
import {startGame} from './game.js'
import {createTile} from './tiles.js'

const $ = id => document.getElementById(id)
const NAME_KEY = 'duo-town:name'

// 이 거리(칸) 안이면 소리 100%, FAR 칸 이상 떨어지면 0%. 사이는 선형으로 줄어든다.
const NEAR_TILES = 3
const FAR_TILES = 9

function volumeFor(tiles) {
  if (tiles <= NEAR_TILES) return 1
  if (tiles >= FAR_TILES) return 0
  return 1 - (tiles - NEAR_TILES) / (FAR_TILES - NEAR_TILES)
}

function showJoinScreen() {
  const creds = readRoomFromHash(location.hash)
  $('join-new').hidden = Boolean(creds)
  $('join-form').hidden = !creds
  if (creds) {
    $('input-name').value = localStorage.getItem(NAME_KEY) ?? ''
    $('input-name').focus()
  }
}

$('btn-create').addEventListener('click', () => {
  location.hash = createRoomHash()
})
window.addEventListener('hashchange', showJoinScreen)
showJoinScreen()

$('join-form').addEventListener('submit', async event => {
  event.preventDefault()
  const creds = readRoomFromHash(location.hash)
  if (!creds) return showJoinScreen()
  const name = $('input-name').value.trim().slice(0, 16) || '이름없음'
  localStorage.setItem(NAME_KEY, name)
  $('btn-join').disabled = true
  $('join-status').textContent = '마이크·카메라 준비 중…'
  const media = await getLocalMedia()
  enterTown({creds, name, media})
})

function isValidState(s) {
  return (
    s !== null &&
    typeof s === 'object' &&
    typeof s.name === 'string' &&
    Number.isFinite(s.x) &&
    Number.isFinite(s.y)
  )
}

function enterTown({creds, name, media}) {
  window.removeEventListener('hashchange', showJoinScreen)
  $('join').hidden = true
  $('app').hidden = false
  $('notice').textContent = media.note

  const local = media.stream
  const me = {
    name,
    x: 0,
    y: 0,
    flip: false,
    mic: Boolean(local?.getAudioTracks().length),
    cam: Boolean(local?.getVideoTracks().length),
  }
  const peers = new Map() // peerId -> {name, tile}
  let screen = null // 내가 공유 중인 화면
  let screenOwner = null // 지금 화면공유 칸에 띄운 사람: peerId 또는 'self'

  const videos = $('videos')
  const selfTile = createTile(videos, {id: 'self', name: `${name} (나)`, self: true})
  if (local) selfTile.setStream(local)

  const net = connectRoom({
    room: creds.room,
    key: creds.key,
    onJoinError: ({error}) => {
      $('notice').textContent = /password/i.test(error)
        ? '비밀번호가 다른 상대가 있어서 연결하지 않았어요.'
        : `연결 오류: ${error}`
    },
  })
  const {room} = net

  const publicState = () => ({name: me.name, x: me.x, y: me.y, flip: me.flip, mic: me.mic, cam: me.cam})
  const sendState = target => net.state.send(publicState(), target ? {target} : undefined)

  const game = startGame({
    parent: $('game'),
    me: {id: selfId, name},
    onLocalMove: pos => {
      Object.assign(me, pos)
      sendState()
    },
    onDistances: distances => {
      const always = $('chk-always').checked
      for (const [id, tiles] of distances) {
        peers.get(id)?.tile.setVolume(always ? 1 : volumeFor(tiles))
      }
    },
  })

  function updateStatus() {
    const names = [...peers.values()].map(p => p.name)
    const status = $('peer-status')
    status.textContent = names.length ? `연결됨: ${names.join(', ')}` : '친구 기다리는 중 · 초대 링크를 보내세요'
    status.classList.toggle('is-connected', names.length > 0)
  }

  function ensurePeer(id) {
    let peer = peers.get(id)
    if (!peer) {
      peer = {name: '친구', tile: createTile(videos, {id, name: '친구', self: false})}
      peers.set(id, peer)
      updateStatus()
    }
    return peer
  }

  function showScreen(stream, label, owner) {
    screenOwner = owner
    const video = $('screen-video')
    video.muted = owner === 'self'
    video.srcObject = stream
    $('screen-label').textContent = label
    $('screen-box').hidden = false
  }

  function hideScreen() {
    if (screen && screenOwner !== 'self') return showScreen(screen, '내 화면 (공유 중)', 'self')
    screenOwner = null
    $('screen-video').srcObject = null
    $('screen-box').hidden = true
  }

  room.onPeerJoin = id => {
    ensurePeer(id)
    if (local) room.addStream(local, {target: id, metadata: {kind: 'cam'}})
    if (screen) room.addStream(screen, {target: id, metadata: {kind: 'screen'}})
    sendState(id)
  }

  room.onPeerLeave = id => {
    peers.get(id)?.tile.remove()
    peers.delete(id)
    game.removePeer(id)
    if (screenOwner === id) hideScreen()
    updateStatus()
  }

  room.onPeerStream = (stream, id, metadata) => {
    const peer = ensurePeer(id)
    if (metadata?.kind === 'screen') showScreen(stream, `${peer.name}의 화면`, id)
    else peer.tile.setStream(stream)
  }

  net.state.onMessage = (state, {peerId}) => {
    if (!isValidState(state)) return
    const peer = ensurePeer(peerId)
    peer.name = state.name.slice(0, 16)
    peer.tile.setName(peer.name, state.mic !== false)
    peer.tile.setCamOn(state.cam !== false)
    game.upsertPeer(peerId, {...state, name: peer.name})
    if (screenOwner === peerId) $('screen-label').textContent = `${peer.name}의 화면`
    updateStatus()
  }

  net.screenOff.onMessage = (_data, {peerId}) => {
    if (screenOwner === peerId) hideScreen()
  }

  // 아래 버튼들
  const micBtn = $('btn-mic')
  const camBtn = $('btn-cam')
  const screenBtn = $('btn-screen')
  micBtn.classList.add('is-toggle')
  camBtn.classList.add('is-toggle')

  function renderButtons() {
    micBtn.disabled = !local?.getAudioTracks().length
    camBtn.disabled = !local?.getVideoTracks().length
    micBtn.textContent = micBtn.disabled ? '마이크 없음' : me.mic ? '마이크 켜짐' : '마이크 꺼짐'
    camBtn.textContent = camBtn.disabled ? '카메라 없음' : me.cam ? '카메라 켜짐' : '카메라 꺼짐'
    micBtn.setAttribute('aria-pressed', String(me.mic))
    camBtn.setAttribute('aria-pressed', String(me.cam))
    screenBtn.textContent = screen ? '화면공유 멈추기' : '화면공유'
    screenBtn.setAttribute('aria-pressed', String(Boolean(screen)))
  }
  renderButtons()

  micBtn.addEventListener('click', () => {
    me.mic = !me.mic
    setTracksEnabled(local.getAudioTracks(), me.mic)
    selfTile.setName(`${name} (나)`, me.mic)
    renderButtons()
    sendState()
  })

  camBtn.addEventListener('click', () => {
    me.cam = !me.cam
    setTracksEnabled(local.getVideoTracks(), me.cam)
    selfTile.setCamOn(me.cam)
    renderButtons()
    sendState()
  })

  function stopScreen() {
    if (!screen) return
    room.removeStream(screen)
    for (const track of screen.getTracks()) track.stop()
    screen = null
    net.screenOff.send(true)
    if (screenOwner === 'self') hideScreen()
    renderButtons()
  }

  screenBtn.addEventListener('click', async () => {
    if (screen) return stopScreen()
    try {
      screen = await startScreenCapture()
    } catch {
      return // 공유 창에서 취소함
    }
    screen.getVideoTracks()[0]?.addEventListener('ended', stopScreen)
    room.addStream(screen, {metadata: {kind: 'screen'}})
    showScreen(screen, '내 화면 (공유 중)', 'self')
    renderButtons()
  })

  $('btn-screen-full').addEventListener('click', () => {
    $('screen-video').requestFullscreen?.()
  })

  $('btn-invite').addEventListener('click', async () => {
    const button = $('btn-invite')
    try {
      await navigator.clipboard.writeText(location.href)
      button.textContent = '복사됨'
      setTimeout(() => (button.textContent = '초대 링크 복사'), 2000)
    } catch {
      window.prompt('이 링크를 친구에게 보내세요', location.href)
    }
  })

  window.addEventListener('pagehide', () => room.leave())
  updateStatus()
}
