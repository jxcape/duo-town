import * as Phaser from 'phaser'
import {MAP, MAP_W, MAP_H, TILE, SOLID, SPAWNS, tileCenter, baseTileAt} from './map.js'

const SPEED = 150 // px/s
const SEND_INTERVAL_MS = 66 // 위치 전송은 초당 15번까지
const SKIN = 0xf2c9a0

// 에셋을 고르기 전까지 쓰는 임시 그림. 전부 코드로 그린다.
function drawTileTextures(scene) {
  const tex = (key, draw) => {
    const g = scene.add.graphics()
    draw(g)
    g.generateTexture(key, TILE, TILE)
    g.destroy()
  }

  tex('floor', g => {
    g.fillStyle(0xc9a27a).fillRect(0, 0, TILE, TILE)
    g.fillStyle(0xb48d66).fillRect(0, 15, TILE, 2).fillRect(0, 31, TILE, 1)
    g.fillRect(10, 0, 1, 15).fillRect(24, 16, 1, 15)
  })
  tex('carpet', g => {
    g.fillStyle(0x5c7aa8).fillRect(0, 0, TILE, TILE)
    g.fillStyle(0x6888b6).fillRect(4, 4, 2, 2).fillRect(20, 12, 2, 2).fillRect(10, 24, 2, 2)
  })
  tex('wall', g => {
    g.fillStyle(0x3b3f55).fillRect(0, 0, TILE, TILE)
    g.fillStyle(0x4a4f6a).fillRect(0, 0, TILE, 8)
    g.fillStyle(0x2c2f40).fillRect(0, 30, TILE, 2)
  })
  tex('desk', g => {
    g.fillStyle(0x8a5a3b).fillRect(1, 8, 30, 20)
    g.fillStyle(0x6e4630).fillRect(1, 24, 30, 4)
    g.fillStyle(0x23263a).fillRect(9, 4, 14, 11)
    g.fillStyle(0x7fb2ff).fillRect(10, 5, 12, 8)
    g.fillStyle(0x23263a).fillRect(15, 15, 2, 3)
  })
  tex('plant', g => {
    g.fillStyle(0x9c5b3b).fillRect(10, 20, 12, 10)
    g.fillStyle(0x3f9b55).fillCircle(16, 14, 9)
    g.fillStyle(0x56b86c).fillCircle(12, 11, 4).fillCircle(20, 12, 4)
  })
  tex('sofa', g => {
    g.fillStyle(0x8d3d55).fillRoundedRect(0, 6, TILE, 22, 5)
    g.fillStyle(0xb0506a).fillRoundedRect(2, 12, TILE - 4, 12, 4)
  })
  tex('table', g => {
    g.fillStyle(0x6e4630).fillRect(2, 10, 28, 16)
    g.fillStyle(0xa07850).fillRect(2, 8, 28, 14)
  })
}

const OBJECT_TEXTURE = {'#': 'wall', D: 'desk', P: 'plant', S: 'sofa', T: 'table'}

function colorFromId(id) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return Phaser.Display.Color.HSVToRGB((h % 360) / 360, 0.55, 0.85).color
}

function avatarTexture(scene, color) {
  const key = `avatar-${color.toString(16)}`
  if (scene.textures.exists(key)) return key
  const hair = Phaser.Display.Color.IntegerToColor(color).darken(40).color
  const g = scene.add.graphics()
  g.fillStyle(0x000000, 0.25).fillEllipse(12, 29, 16, 5)
  g.fillStyle(color).fillRoundedRect(5, 15, 14, 13, 4)
  g.fillStyle(SKIN).fillCircle(12, 10, 7)
  g.fillStyle(hair).fillRoundedRect(5, 2, 14, 6, 3)
  g.fillStyle(0x222222).fillRect(9, 10, 2, 2).fillRect(13, 10, 2, 2)
  g.generateTexture(key, 24, 32)
  g.destroy()
  return key
}

function nameLabel(scene, text) {
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: {x: 4, y: 1},
      resolution: 3,
    })
    .setOrigin(0.5, 1)
    .setDepth(10000)
  // pixelArt 설정은 모든 그림을 각지게 늘린다. 한글 이름은 그러면 깨지므로 글자만 부드럽게 늘린다.
  label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
  return label
}

class TownScene extends Phaser.Scene {
  constructor(world) {
    super('town')
    this.world = world
    this.remotes = new Map()
    this.lastSent = {x: NaN, y: NaN, moving: false, flip: false, at: 0}
  }

  create() {
    drawTileTextures(this)

    const solids = this.physics.add.staticGroup()
    MAP.forEach((line, row) => {
      ;[...line].forEach((ch, col) => {
        const {x, y} = tileCenter(col, row)
        this.add.image(x, y, baseTileAt(col, row) === ',' ? 'carpet' : 'floor')
        if (SOLID.has(ch)) solids.create(x, y, OBJECT_TEXTURE[ch])
      })
    })

    const [col, row] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]
    const spawn = tileCenter(col, row)
    const me = this.world.me
    this.player = this.physics.add.image(spawn.x, spawn.y, avatarTexture(this, colorFromId(me.id)))
    this.player.body.setSize(16, 10).setOffset(4, 21)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, solids)
    this.playerLabel = nameLabel(this, me.name)

    this.physics.world.setBounds(0, 0, MAP_W, MAP_H)
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT')

    this.world.onSceneReady(this)
  }

  update(_time, delta) {
    const k = this.keys
    const dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0)
    const dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0)
    const len = Math.hypot(dx, dy) || 1
    this.player.setVelocity((dx / len) * SPEED, (dy / len) * SPEED)
    if (dx !== 0) this.player.setFlipX(dx < 0)

    const p = this.player
    p.setDepth(p.y)
    this.playerLabel.setPosition(p.x, p.y - 17)
    this.maybeSendPosition(dx !== 0 || dy !== 0)

    const t = Math.min(1, (delta / 1000) * 12)
    const distances = new Map()
    for (const [id, r] of this.remotes) {
      if (Math.hypot(r.tx - r.img.x, r.ty - r.img.y) > TILE * 6) {
        r.img.setPosition(r.tx, r.ty)
      } else {
        r.img.setPosition(r.img.x + (r.tx - r.img.x) * t, r.img.y + (r.ty - r.img.y) * t)
      }
      r.img.setDepth(r.img.y)
      r.label.setPosition(r.img.x, r.img.y - 17)
      distances.set(id, Math.hypot(r.img.x - p.x, r.img.y - p.y) / TILE)
    }
    this.world.onDistances(distances)
  }

  maybeSendPosition(moving) {
    const now = this.time.now
    const p = this.player
    const s = this.lastSent
    const changed = Math.abs(p.x - s.x) > 0.5 || Math.abs(p.y - s.y) > 0.5 || moving !== s.moving || p.flipX !== s.flip
    if (!changed || now - s.at < SEND_INTERVAL_MS) return
    this.lastSent = {x: p.x, y: p.y, moving, flip: p.flipX, at: now}
    this.world.onLocalMove({x: Math.round(p.x), y: Math.round(p.y), flip: p.flipX})
  }

  upsertRemote(id, state) {
    let r = this.remotes.get(id)
    if (!r) {
      const img = this.add.image(state.x, state.y, avatarTexture(this, colorFromId(id)))
      r = {img, label: nameLabel(this, state.name), tx: state.x, ty: state.y}
      this.remotes.set(id, r)
    }
    r.tx = state.x
    r.ty = state.y
    r.img.setFlipX(Boolean(state.flip))
    if (r.label.text !== state.name) r.label.setText(state.name)
  }

  removeRemote(id) {
    const r = this.remotes.get(id)
    if (!r) return
    r.img.destroy()
    r.label.destroy()
    this.remotes.delete(id)
  }

  currentPosition() {
    return {x: Math.round(this.player.x), y: Math.round(this.player.y), flip: this.player.flipX}
  }
}

// Phaser 장면은 비동기로 준비되므로, 준비 전에 들어온 친구 정보는 모아 뒀다가 넘긴다.
export function startGame({parent, me, onLocalMove, onDistances}) {
  let scene = null
  const pending = new Map()

  const world = {
    me,
    onLocalMove,
    onDistances,
    onSceneReady(s) {
      scene = s
      for (const [id, state] of pending) scene.upsertRemote(id, state)
      pending.clear()
      onLocalMove(scene.currentPosition())
    },
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: MAP_W,
    height: MAP_H,
    backgroundColor: '#1d1f2b',
    pixelArt: true,
    physics: {default: 'arcade', arcade: {debug: false}},
    scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH},
    scene: new TownScene(world),
  })

  return {
    upsertPeer(id, state) {
      if (scene) scene.upsertRemote(id, state)
      else pending.set(id, state)
    },
    removePeer(id) {
      pending.delete(id)
      scene?.removeRemote(id)
    },
    position() {
      return scene ? scene.currentPosition() : null
    },
  }
}
