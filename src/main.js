import './style.css'
import RAPIER from '@dimforge/rapier3d-compat'
import { FURNITURE, ROOMS, STREET_PIECES, activeHouse, advanceFight, createState, fightReadout, reduce, streetReady, withFight } from './logic.js'
import { createWorld } from './world.js'

const app = document.querySelector('#app')
app.innerHTML = `
  <canvas id="view"></canvas>
  <div class="crosshair" id="crosshair"></div>
  <header class="top">
    <h1>East House</h1>
    <p id="where">East Nashville</p>
  </header>
  <section class="sheet hidden" id="sheet">
    <h2 id="sheet-title">Choose a house</h2>
    <p class="lede" id="sheet-copy"></p>
    <div class="cards" id="house-cards"></div>
    <button type="button" class="primary hidden" id="again">Decorate this house again</button>
  </section>
  <section class="dock hidden" id="dock">
    <p class="status" id="status"></p>
    <div class="catalog" id="catalog"></div>
    <div class="move">
      <button type="button" id="walk">Hold to walk</button>
    </div>
    <button type="button" id="place">Place here</button>
    <button type="button" class="hidden" id="grow">Step outside</button>
    <div class="moves hidden" id="moves">
      <button type="button" id="punch">Punch</button>
      <button type="button" id="kick">Kick</button>
      <button type="button" id="block">Block</button>
    </div>
    <div class="cards hidden" id="next-houses"></div>
  </section>
  <div class="stick hidden" id="stick" aria-label="Move">
    <span id="knob"></span>
  </div>
`

const canvas = document.querySelector('#view')
await RAPIER.init()
const world = createWorld(canvas, RAPIER)
const sheet = document.querySelector('#sheet')
const dock = document.querySelector('#dock')
const where = document.querySelector('#where')
const status = document.querySelector('#status')
const sheetTitle = document.querySelector('#sheet-title')
const sheetCopy = document.querySelector('#sheet-copy')
const houseCards = document.querySelector('#house-cards')
const nextHouses = document.querySelector('#next-houses')
const catalog = document.querySelector('#catalog')
const again = document.querySelector('#again')
const place = document.querySelector('#place')
const grow = document.querySelector('#grow')
const moves = document.querySelector('#moves')
const punch = document.querySelector('#punch')
const kick = document.querySelector('#kick')
const block = document.querySelector('#block')
const crosshair = document.querySelector('#crosshair')
const move = document.querySelector('.move')
const stick = document.querySelector('#stick')
const knob = document.querySelector('#knob')
const walk = document.querySelector('#walk')

const input = { forward: 0, strafe: 0, lookX: 0, lookY: 0 }
let state = createState()
let selected = 'lamp'
let streetKind = 'bike'
let prevScreen = ''
let lookDrag = null
let punchEdge = false
let kickEdge = false
let blockHeld = false
let fightEndAt = 0

houseCards.innerHTML = Object.entries(ROOMS)
  .map(
    ([id, room]) =>
      `<button type="button" data-house="${id}">${room.name}<span>${room.blurb}</span></button>`,
  )
  .join('')
nextHouses.innerHTML = Object.entries(ROOMS)
  .map(([id, room]) => `<button type="button" data-house="${id}">${room.name}</button>`)
  .join('')
catalog.innerHTML = [...FURNITURE, ...STREET_PIECES]
  .map(
    (item) =>
      `<button type="button" data-piece="${item.id}" data-lane="${item.lane || 'room'}">${item.name}</button>`,
  )
  .join('')

function paint() {
  const house = activeHouse(state)
  const interior = state.screen === 'decorate' || state.screen === 'fight' || state.screen === 'kept'
  sheet.classList.toggle('hidden', interior || state.screen === 'street')
  dock.classList.toggle('hidden', !interior && state.screen !== 'street')
  crosshair.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street' && state.screen !== 'fight')
  again.classList.toggle('hidden', state.screen !== 'rebuild')
  houseCards.classList.toggle('hidden', state.screen !== 'pick')
  grow.classList.toggle('hidden', state.screen !== 'kept')
  moves.classList.toggle('hidden', state.screen !== 'fight')
  place.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street')
  const walking = state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street' || state.screen === 'fight'
  move.classList.toggle('hidden', !walking)
  stick.classList.toggle('hidden', !walking)
  nextHouses.classList.toggle('hidden', state.screen !== 'street')
  catalog.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street')

  if (state.screen === 'pick') {
    where.textContent = 'East Nashville'
    sheetTitle.textContent = 'Choose a house'
    sheetCopy.textContent = 'Walk around inside it and place the furniture. If Nico shows up, punch, kick, or block.'
  } else if (state.screen === 'rebuild' && house) {
    where.textContent = 'On the street'
    sheetTitle.textContent = 'Back on the street'
    sheetCopy.textContent = `${house.name} has to be decorated again. That furniture is gone. The rest of the block stays.`
  } else if (house) {
    where.textContent = `${house.name} · lot ${house.lot}`
  }

  if (state.screen === 'decorate' && house) {
    const left = Math.max(0, 3 - house.furniture.length)
    status.textContent = left
      ? `${house.furniture.length} placed. Drag to look, hold Walk, then Place here. ${left} more.`
      : 'The room is furnished.'
  } else if (state.screen === 'kept' && house) {
    status.textContent = `${house.name} stays decorated. Turn around and walk out the gold door, or tap Step outside.`
  } else if (state.screen === 'street') {
    paintStreet()
  } else if (state.screen === 'fight' && state.fight) {
    paintFight(world.fightDistance())
  }

  for (const button of catalog.querySelectorAll('button')) {
    const roomPiece = button.dataset.lane === 'room'
    const show = state.screen === 'street' ? !roomPiece : roomPiece
    button.classList.toggle('hidden', !show)
    const active = state.screen === 'street' ? button.dataset.piece === streetKind : button.dataset.piece === selected
    button.setAttribute('aria-pressed', active ? 'true' : 'false')
  }
  for (const button of nextHouses.querySelectorAll('button')) {
    button.disabled = !streetReady(state)
  }
}

function paintStreet() {
  const names = state.street.map((piece) => STREET_PIECES.find((item) => item.id === piece.kind)?.name)
  const drop = world.dropPoint()
  const piece = STREET_PIECES.find((item) => item.id === streetKind)
  place.disabled = !drop.ok
  if (!drop.ok && piece) {
    status.textContent = drop.reason === 'crowded'
      ? 'Too close to another piece. Take a step, then Place here.'
      : piece.lane === 'sidewalk'
        ? `${piece.name} sits on the sidewalk. Walk onto it, then Place here.`
        : `${piece.name} sits in the road. Walk into it, then Place here.`
    return
  }
  place.disabled = false
  status.textContent = names.length === 0
    ? 'Walk onto the sidewalk or into the road. Place here bloops it at your feet.'
    : streetReady(state)
      ? `On the block: ${names.join(', ')}. Choose the next house.`
      : `On the block: ${names.join(', ')}. Add both a sidewalk piece and a street piece.`
}

function paintFight(distance) {
  if (!state.fight) return
  const read = fightReadout(state.fight, distance)
  status.textContent = `${read.score}. ${read.line}`
  crosshair.classList.remove('punch', 'kick', 'warn')
  if (state.fight.nicoPhase === 'windup' || state.fight.nicoPhase === 'strike') crosshair.classList.add('warn')
  else if (distance <= 1.42) crosshair.classList.add('punch')
  else if (distance <= 2.12) crosshair.classList.add('kick')
  const busy = state.fight.playerMove === 'punch' || state.fight.playerMove === 'kick' || state.fight.playerMove === 'hurt'
  punch.disabled = busy
  kick.disabled = busy
}

function syncWorld() {
  const interior = state.screen === 'decorate' || state.screen === 'fight' || state.screen === 'kept'
  const reset = state.screen === 'decorate' && prevScreen !== 'decorate'
    || ((state.screen === 'street' || state.screen === 'rebuild' || state.screen === 'pick') && prevScreen !== state.screen)
  world.sync(state, { reset })
  if (state.screen === 'fight' && prevScreen !== 'fight') world.faceNico()
  if (!interior && state.screen !== 'street' && state.screen !== 'rebuild' && state.screen !== 'pick') {
    world.sync(state, { reset: true })
  }
}

function afterChange() {
  paint()
  syncWorld()
  prevScreen = state.screen
  if (state.screen !== 'fight') {
    fightEndAt = 0
    world.duel = null
    world.finisher = null
  }
}

function onPlace(spot) {
  if (state.screen === 'decorate') {
    const point = spot || world.placePoint()
    const before = state.draft?.furniture.length || 0
    state = reduce(state, 'place', { kind: selected, ...point })
    if ((state.draft?.furniture.length || 0) > before || state.screen === 'fight') bloop()
  } else if (state.screen === 'street') {
    const drop = world.dropPoint()
    if (!drop.ok) {
      paintStreet()
      return
    }
    const before = state.street.length
    state = reduce(state, 'place-street', { kind: streetKind, x: drop.x, z: drop.z, ax: drop.x, az: drop.z, rot: drop.rot })
    if (state.street.length === before) {
      paintStreet()
      return
    }
    bloop()
  } else return
  afterChange()
}

app.addEventListener('click', (event) => {
  const house = event.target.closest('[data-house]')
  if (house) {
    state = reduce(state, 'choose-house', { house: house.dataset.house })
    afterChange()
    return
  }
  const piece = event.target.closest('[data-piece]')
  if (piece && catalog.contains(piece)) {
    if (state.screen === 'street') streetKind = piece.dataset.piece
    else selected = piece.dataset.piece
    paint()
    return
  }
  if (event.target.closest('#place')) onPlace()
  if (event.target.closest('#grow')) {
    const index = Math.max(0, state.kept.findIndex((house) => house.uid === state.focusId))
    state = reduce(state, 'to-street')
    afterChange()
    world.spawnOutside(index)
  }
  if (event.target.closest('#again')) {
    state = reduce(state, 'decorate-again')
    afterChange()
  }
})

const canLook = () => state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street' || state.screen === 'fight'
let lockClick = false

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && canLook() && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.()
    lockClick = true
  }
  lookDrag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }
})
canvas.addEventListener('pointermove', (event) => {
  if (!lookDrag || lookDrag.id !== event.pointerId) return
  if (document.pointerLockElement === canvas) return
  const dx = event.clientX - lookDrag.x
  const dy = event.clientY - lookDrag.y
  if (Math.hypot(dx, dy) > 6) lookDrag.moved = true
  if (!canLook()) return
  input.lookX += dx * 0.0042
  input.lookY += dy * 0.0032
  lookDrag.x = event.clientX
  lookDrag.y = event.clientY
})
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || !canLook()) return
  input.lookX += event.movementX * 0.0026
  input.lookY += event.movementY * 0.002
})
canvas.addEventListener('pointerup', (event) => {
  if (!lookDrag || lookDrag.id !== event.pointerId) return
  lookDrag = null
  lockClick = false
})
canvas.addEventListener('pointercancel', () => {
  lookDrag = null
  lockClick = false
})

function pressWalk(event) {
  if (!canLook()) return
  walk.setPointerCapture?.(event.pointerId)
  input.forward = 1
  walk.setAttribute('aria-pressed', 'true')
}
function releaseWalk() {
  if (stickPointer == null) input.forward = 0
  walk.setAttribute('aria-pressed', 'false')
}
walk.addEventListener('pointerdown', pressWalk)
walk.addEventListener('pointerup', releaseWalk)
walk.addEventListener('pointercancel', releaseWalk)
walk.addEventListener('lostpointercapture', releaseWalk)

let stickPointer = null
let stickOrigin = null
function moveStick(event) {
  const dx = Math.max(-1, Math.min(1, (event.clientX - stickOrigin.x) / 46))
  const dy = Math.max(-1, Math.min(1, (event.clientY - stickOrigin.y) / 46))
  input.strafe = dx
  input.forward = -dy
  knob.style.transform = `translate(${dx * 26}px, ${dy * 26}px)`
}
stick.addEventListener('pointerdown', (event) => {
  if (!canLook()) return
  stick.setPointerCapture(event.pointerId)
  stickPointer = event.pointerId
  stickOrigin = { x: event.clientX, y: event.clientY }
  moveStick(event)
})
stick.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointer) return
  moveStick(event)
})
function endStick(event) {
  if (event.pointerId !== stickPointer) return
  stickPointer = null
  input.strafe = 0
  input.forward = 0
  knob.style.transform = ''
}
stick.addEventListener('pointerup', endStick)
stick.addEventListener('pointercancel', endStick)

window.addEventListener('keydown', (event) => {
  if (event.key === 'w' || event.key === 'ArrowUp') input.forward = 1
  if (event.key === 's' || event.key === 'ArrowDown') input.forward = -1
  if (event.key === 'a') input.strafe = -1
  if (event.key === 'd') input.strafe = 1
  if (event.key === 'ArrowLeft') input.lookX += 0.12
  if (event.key === 'ArrowRight') input.lookX -= 0.12
  if (event.key === ' ') {
    event.preventDefault()
    if (state.screen === 'fight') punchEdge = true
    else onPlace()
  }
  if (event.key === 'j' || event.key === 'J') punchEdge = true
  if (event.key === 'k' || event.key === 'K') kickEdge = true
  if (event.key === 'l' || event.key === 'L') {
    blockHeld = true
    block.setAttribute('aria-pressed', 'true')
  }
})
window.addEventListener('keyup', (event) => {
  if (event.key === 'w' || event.key === 'ArrowUp' || event.key === 's' || event.key === 'ArrowDown') input.forward = 0
  if (event.key === 'a' || event.key === 'd') input.strafe = 0
  if (event.key === 'l' || event.key === 'L') {
    blockHeld = false
    block.setAttribute('aria-pressed', 'false')
  }
})

new ResizeObserver(() => world.resize()).observe(app)

punch.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  punchEdge = true
})
kick.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  kickEdge = true
})
function holdBlock(event) {
  event.preventDefault()
  block.setPointerCapture?.(event.pointerId)
  blockHeld = true
  block.setAttribute('aria-pressed', 'true')
}
function releaseBlock() {
  blockHeld = false
  block.setAttribute('aria-pressed', 'false')
}
block.addEventListener('pointerdown', holdBlock)
block.addEventListener('pointerup', releaseBlock)
block.addEventListener('pointercancel', releaseBlock)
block.addEventListener('lostpointercapture', releaseBlock)

let audioCtx = null
function audio() {
  audioCtx = audioCtx || new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function tone(freq, dur, type, gain, slide = 0) {
  const ctx = audio()
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}
function bloop() {
  tone(520, 0.09, 'sine', 0.06, -220)
  window.setTimeout(() => tone(340, 0.12, 'sine', 0.045, -80), 60)
}
function thump() { tone(160, 0.09, 'square', 0.04, -40) }
function clack() { tone(880, 0.05, 'triangle', 0.04) }
function swish() { tone(420, 0.06, 'sine', 0.025, 180) }
app.addEventListener('pointerdown', () => audio().resume?.(), { once: false })

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (state.screen === 'fight' && state.fight) {
    if (!state.fight.over) {
      const step = advanceFight(state.fight, dt, {
        distance: world.fightDistance(),
        punch: punchEdge,
        kick: kickEdge,
        block: blockHeld,
      })
      punchEdge = false
      kickEdge = false
      state = { ...state, fight: step.fight }
      for (const event of step.events) {
        if (event === 'hurt') {
          world.react('hurt')
          app.classList.add('bonk')
          window.setTimeout(() => app.classList.remove('bonk'), 180)
          thump()
        } else if (event === 'counter' || event === 'hit') {
          world.react(event)
          thump()
        } else if (event === 'blocked' || event === 'clang') {
          world.react(event)
          clack()
        } else if (event === 'whiff' || event === 'nico-whiff' || event === 'swing-punch' || event === 'swing-kick') swish()
        else if (event === 'telegraph') tone(240, 0.08, 'triangle', 0.03, 80)
      }
      if (step.done) fightEndAt = performance.now() + 520
    }
    world.duel = state.fight
    world.finisher = state.fight.over
    paintFight(world.fightDistance())
    if (state.fight.over && fightEndAt && performance.now() >= fightEndAt) {
      fightEndAt = 0
      state = withFight(state, state.fight)
      afterChange()
    }
  } else {
    world.duel = null
    world.finisher = null
  }
  world.ghostKind = state.screen === 'decorate' ? selected : null
  world.pieceKind = state.screen === 'street' ? streetKind : null
  world.lane = STREET_PIECES.find((item) => item.id === streetKind)?.lane || 'sidewalk'
  const moving = state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street' || state.screen === 'fight'
  world.update(dt, moving ? input : { forward: 0, strafe: 0, lookX: 0, lookY: 0 })
  if (world.consumeExit() && state.screen === 'kept') {
    const index = Math.max(0, state.kept.findIndex((house) => house.uid === state.focusId))
    state = reduce(state, 'to-street')
    afterChange()
    world.spawnOutside(index)
  }
  if (state.screen === 'street') paintStreet()
  requestAnimationFrame(frame)
}

function writePose(list, id, pose) {
  return list.map((item) => (item.id === id ? { ...item, ...pose } : item))
}
world.onRest = (id, pose) => {
  if (state.draft) {
    state = { ...state, draft: { ...state.draft, furniture: writePose(state.draft.furniture, id, pose) } }
  }
  state = {
    ...state,
    kept: state.kept.map((house) => ({ ...house, furniture: writePose(house.furniture, id, pose) })),
    street: writePose(state.street, id, pose),
  }
}

afterChange()
requestAnimationFrame(frame)
