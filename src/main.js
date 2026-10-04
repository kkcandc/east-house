import './style.css'
import RAPIER from '@dimforge/rapier3d-compat'
import { FURNITURE, ROOMS, STREET_PIECES, activeHouse, createState, reduce, streetReady } from './logic.js'
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
    <button type="button" class="hidden" id="grow">Add sidewalk and street</button>
    <button type="button" id="strike" class="hidden">Strike</button>
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
const strike = document.querySelector('#strike')
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
let fightSerial = 0
let fightRoundWatch = 0
let lookDrag = null

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
  crosshair.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street')
  again.classList.toggle('hidden', state.screen !== 'rebuild')
  houseCards.classList.toggle('hidden', state.screen !== 'pick')
  grow.classList.toggle('hidden', state.screen !== 'kept')
  strike.classList.toggle('hidden', state.screen !== 'fight')
  place.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street')
  const walking = state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street'
  move.classList.toggle('hidden', !walking)
  stick.classList.toggle('hidden', !walking)
  nextHouses.classList.toggle('hidden', state.screen !== 'street')
  catalog.classList.toggle('hidden', state.screen !== 'decorate' && state.screen !== 'street')

  if (state.screen === 'pick') {
    where.textContent = 'East Nashville'
    sheetTitle.textContent = 'Choose a house'
    sheetCopy.textContent = 'Walk around inside it and place the furniture. If someone comes for the house, one button punches or kicks.'
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
    status.textContent = `${house.name} stays decorated. Walk around, then add the sidewalk and the street.`
  } else if (state.screen === 'street') {
    const names = state.street.map((piece) => STREET_PIECES.find((item) => item.id === piece.kind)?.name)
    status.textContent = names.length === 0
      ? 'Stand on the sidewalk or in the road. Place here sets it down on that ground.'
      : streetReady(state)
        ? `On the block: ${names.join(', ')}. Choose the next house.`
        : `On the block: ${names.join(', ')}. Add both a sidewalk piece and a street piece.`
  } else if (state.screen === 'fight' && state.fight) {
    const ready = state.fight.open
    status.textContent = ready
      ? state.fight.kind === 'punch'
        ? 'Nico is open. Punch.'
        : 'Nico is open. Kick.'
      : 'Nico from Five Points winds up. Wait for the opening.'
    strike.textContent = ready ? (state.fight.kind === 'punch' ? 'Punch' : 'Kick') : 'Wait'
    strike.classList.remove('punch', 'kick', 'wait')
    strike.classList.add(ready ? state.fight.kind : 'wait')
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
  const previous = prevScreen
  paint()
  syncWorld()
  prevScreen = state.screen
  if (state.screen === 'fight' && state.fight && fightRoundWatch !== state.fight.round) {
    beginRound()
  } else if (state.screen !== 'fight') {
    fightSerial += 1
    fightRoundWatch = 0
    world.mood = 'idle'
  }
  if (previous === state.screen && state.screen === 'fight') {
    /* round advanced via beginRound */
  }
}

function beginRound() {
  if (!state.fight) return
  fightRoundWatch = state.fight.round
  const token = ++fightSerial
  const round = state.fight.round
  world.mood = 'windup'
  paint()
  window.setTimeout(() => {
    if (token !== fightSerial) return
    if (state.screen !== 'fight' || state.fight?.round !== round) return
    state = reduce(state, 'open-window')
    world.mood = 'open'
    paint()
    window.setTimeout(() => {
      if (token !== fightSerial) return
      if (state.screen !== 'fight' || !state.fight?.open || state.fight.round !== round) return
      state = reduce(state, 'whiff')
      world.mood = 'idle'
      afterChange()
    }, 4500)
  }, 650)
}

function onPlace(spot) {
  const point = spot || world.placePoint()
  if (state.screen === 'decorate') {
    state = reduce(state, 'place', { kind: selected, ...point })
  } else if (state.screen === 'street') {
    state = reduce(state, 'place-street', { kind: streetKind })
  } else return
  afterChange()
}

function onStrike() {
  if (state.screen !== 'fight' || !state.fight) return
  const kind = state.fight.kind
  const open = state.fight.open
  fightSerial += 1
  state = reduce(state, 'strike')
  if (open) world.playStrike(kind)
  world.mood = open ? 'hit' : 'idle'
  fightRoundWatch = 0
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
  if (event.target.closest('#strike')) onStrike()
  if (event.target.closest('#grow')) {
    state = reduce(state, 'to-street')
    afterChange()
  }
  if (event.target.closest('#again')) {
    state = reduce(state, 'decorate-again')
    afterChange()
  }
})

const canLook = () => state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street'
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
    if (state.screen === 'fight') onStrike()
    else onPlace()
  }
})
window.addEventListener('keyup', (event) => {
  if (event.key === 'w' || event.key === 'ArrowUp' || event.key === 's' || event.key === 'ArrowDown') input.forward = 0
  if (event.key === 'a' || event.key === 'd') input.strafe = 0
})

new ResizeObserver(() => world.resize()).observe(app)

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  world.ghostKind = state.screen === 'decorate' ? selected : null
  world.lane = STREET_PIECES.find((item) => item.id === streetKind)?.lane || 'sidewalk'
  const moving = state.screen === 'decorate' || state.screen === 'kept' || state.screen === 'street'
  world.update(dt, moving ? input : { forward: 0, strafe: 0, lookX: 0, lookY: 0 })
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
