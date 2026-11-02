import {joinRoom, selfId} from 'trystero'

// 서로를 찾는 첫 단계만 Trystero 기본 공개망(Nostr)을 쓴다.
// 연결된 뒤 위치·음성·화상·화면은 두 브라우저가 직접 주고받는다.
const APP_ID = 'duo-town-jxcape-v1'

export {selfId}

function randomToken(length) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('')
}

// 방 이름과 비밀번호는 주소의 # 뒤에만 둔다. # 뒤는 서버로 전송되지 않는다.
export function readRoomFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const room = params.get('r')
  const key = params.get('k')
  return room && key ? {room, key} : null
}

export function createRoomHash() {
  return `#r=${randomToken(10)}&k=${randomToken(16)}`
}

export function connectRoom({room, key, onJoinError}) {
  const trysteroRoom = joinRoom({appId: APP_ID, password: key}, room, {onJoinError})
  return {
    room: trysteroRoom,
    // 내 이름·위치·마이크/카메라 상태
    state: trysteroRoom.makeAction('state'),
    // 화면공유를 멈췄다는 알림
    screenOff: trysteroRoom.makeAction('screen-off'),
  }
}
