// 맵 한 칸 = 32px. 글자 하나가 한 칸이다.
// # 벽  . 나무 바닥  , 카펫  D 책상  P 화분  S 소파  T 테이블
export const TILE = 32

export const MAP = [
  '########################',
  '#P..........P#,,,,,,,,P#',
  '#.DD..DD..DD.#,,,,,,,,,#',
  '#............#,,SSSS,,,#',
  '#............#,,,,,,,,,#',
  '#.DD..DD..DD.#,,,TTT,,,#',
  '#.............,,,TTT,,,#',
  '#.............,,,,,,,,,#',
  '#.DD..DD..DD.#,,,,,,,,,#',
  '#............#,,SSSS,,,#',
  '#............#,,,,,,,,,#',
  '#P..........P#,,,,,,,,P#',
  '########################',
]

export const MAP_W = MAP[0].length * TILE
export const MAP_H = MAP.length * TILE

// 지나갈 수 없는 칸
export const SOLID = new Set(['#', 'D', 'P', 'S', 'T'])

// 처음 들어올 때 서는 자리(칸 좌표). 같은 줄에 두어 겹치지 않게 흩어 놓는다.
export const SPAWNS = [
  [3, 7],
  [5, 7],
  [7, 7],
  [9, 7],
]

export function tileCenter(col, row) {
  return {x: col * TILE + TILE / 2, y: row * TILE + TILE / 2}
}

// 오른쪽 라운지(문 오른쪽)는 카펫, 왼쪽 사무실은 나무 바닥을 깐다.
export function baseTileAt(col, row) {
  const ch = MAP[row][col]
  if (ch === ',' || ch === '.') return ch
  return col > 13 ? ',' : '.'
}
