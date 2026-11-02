// 브라우저 두 개를 띄워 실제로 서로 연결되는지 확인한다.
// 사용법: npm run build && npm run test:e2e            (내 맥에서 빌드 결과를 띄워 시험)
//        npm run test:e2e -- https://주소/            (배포된 사이트를 시험)
// 서로 찾는 단계는 인터넷의 공개 Nostr 중계기를 거치므로 네트워크가 필요하다.
import {spawn} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'

const OUT = new URL('./.artifacts/', import.meta.url)
const results = []
const check = (name, ok, detail = '') => {
  results.push({name, ok})
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const skip = (name, reason) => console.log(`SKIP  ${name}  (${reason})`)

async function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {stdio: 'pipe'})
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview가 15초 안에 뜨지 않음')), 15000)
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('4173')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on('exit', code => reject(new Error(`vite preview 종료 (code ${code})`)))
  })
  return child
}

const remoteTile = '#videos .tile:not([data-peer="self"])'

async function waitFor(page, fn, arg, timeout) {
  try {
    await page.waitForFunction(fn, arg, {timeout, polling: 250})
    return true
  } catch {
    return false
  }
}

async function enter(page, url, name) {
  await page.goto(url)
  await page.fill('#input-name', name)
  await page.click('#btn-join')
  await page.waitForSelector('#app:not([hidden])', {timeout: 15000})
}

const baseUrl = process.argv[2]
const preview = baseUrl ? null : await startPreview()
const url = baseUrl ?? 'http://localhost:4173/'

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--auto-select-desktop-capture-source=Entire screen',
  ],
})

try {
  await mkdir(OUT, {recursive: true})
  const ctxA = await browser.newContext({permissions: ['camera', 'microphone'], viewport: {width: 1280, height: 760}})
  const ctxB = await browser.newContext({permissions: ['camera', 'microphone'], viewport: {width: 1280, height: 760}})
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  // A가 방을 만든다
  await a.goto(url)
  await a.click('#btn-create')
  await a.waitForSelector('#join-form:not([hidden])')
  const roomUrl = a.url()
  check('방 만들기: 주소에 방 이름과 비밀번호가 붙음', /#r=\w+&k=\w+/.test(roomUrl), roomUrl.split('#')[1])
  await a.fill('#input-name', '에이')
  await a.click('#btn-join')
  await a.waitForSelector('#app:not([hidden])', {timeout: 15000})

  // B가 같은 링크로 들어온다
  const started = Date.now()
  await enter(b, roomUrl, '비이')

  const connected =
    (await waitFor(a, () => document.querySelector('#peer-status').textContent.includes('비이'), null, 60000)) &&
    (await waitFor(b, () => document.querySelector('#peer-status').textContent.includes('에이'), null, 60000))
  check('서로 연결되고 이름이 보임', connected, `${((Date.now() - started) / 1000).toFixed(1)}초`)
  if (!connected) throw new Error('연결이 안 돼서 나머지 확인을 건너뜀')

  const mediaArrived = sel =>
    waitFor(
      b,
      s => {
        const v = document.querySelector(`${s} video`)
        return v && v.videoWidth > 0 && v.srcObject?.getAudioTracks().length > 0
      },
      sel,
      30000,
    )
  check('B 화면에 A의 카메라 영상과 마이크 소리 트랙이 도착', await mediaArrived(remoteTile))
  const aGotB = await waitFor(
    a,
    s => {
      const v = document.querySelector(`${s} video`)
      return v && v.videoWidth > 0 && v.srcObject?.getAudioTracks().length > 0
    },
    remoteTile,
    30000,
  )
  check('A 화면에 B의 카메라 영상과 마이크 소리 트랙이 도착', aGotB)

  const nearAtStart = await b.evaluate(s => !document.querySelector(s).classList.contains('is-far'), remoteTile)
  check('처음엔 가까워서 소리가 들림', nearAtStart)

  // A가 오른쪽 라운지 끝까지 걸어간다 → 멀어져서 서로 소리가 0이 되어야 한다
  await a.locator('#game canvas').click()
  await a.keyboard.down('ArrowRight')
  await a.waitForTimeout(3500)
  await a.keyboard.up('ArrowRight')
  const farOnB = await waitFor(
    b,
    s => {
      const el = document.querySelector(s)
      return el.classList.contains('is-far') && el.querySelector('video').volume === 0
    },
    remoteTile,
    10000,
  )
  check('A가 멀리 가면 B 쪽에서 A 소리가 0이 됨 (위치 동기화)', farOnB)
  const farOnA = await waitFor(a, s => document.querySelector(s).classList.contains('is-far'), remoteTile, 10000)
  check('A 쪽에서도 B 소리가 0이 됨', farOnA)

  await b.check('#chk-always')
  const alwaysOn = await waitFor(
    b,
    s => {
      const el = document.querySelector(s)
      return !el.classList.contains('is-far') && el.querySelector('video').volume === 1
    },
    remoteTile,
    5000,
  )
  check('"멀어도 항상 듣기"를 켜면 다시 100%', alwaysOn)

  // A가 마이크를 끈다 → B에게 음소거 표시
  await a.click('#btn-mic')
  const mutedShown = await waitFor(
    b,
    s => document.querySelector(`${s} .tile-name`).textContent.includes('음소거'),
    remoteTile,
    10000,
  )
  check('A가 마이크를 끄면 B 화면에 음소거 표시', mutedShown)

  // 화면공유
  await a.click('#btn-screen')
  const captured = await waitFor(a, () => !document.querySelector('#screen-box').hidden, null, 8000)
  if (!captured) {
    skip('화면공유', '이 테스트 브라우저에서 화면 캡처가 열리지 않음. 실제 브라우저에서 확인 필요')
  } else {
    const screenOnB = await waitFor(
      b,
      () => {
        const box = document.querySelector('#screen-box')
        const v = document.querySelector('#screen-video')
        return !box.hidden && v.videoWidth > 0 && document.querySelector('#screen-label').textContent.includes('에이')
      },
      null,
      20000,
    )
    check('A가 화면공유하면 B에게 A의 화면이 보임', screenOnB)
    await a.click('#btn-screen')
    const screenGone = await waitFor(b, () => document.querySelector('#screen-box').hidden, null, 10000)
    check('A가 공유를 멈추면 B 화면에서 사라짐', screenGone)
  }

  await a.screenshot({path: new URL('a.png', OUT).pathname})
  await b.screenshot({path: new URL('b.png', OUT).pathname})

  // B가 나간다 → A는 다시 대기 상태
  await b.close()
  const leftShown = await waitFor(
    a,
    () => document.querySelector('#peer-status').textContent.includes('기다리는 중'),
    null,
    20000,
  )
  check('B가 나가면 A 화면이 대기 상태로 돌아감', leftShown)
} catch (error) {
  check('테스트 진행', false, error.message)
} finally {
  await browser.close()
  preview?.kill()
}

const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
