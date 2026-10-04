import './style.css'
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
      <button type="button" id="turn-left">Turn left</button>
      <button type="button" id="walk">Walk</button>
      <button type="button" id="turn-right">Turn right</button>
      <button type="button" id="back">Step back</button>
    </div>
    <button type="button" id="place">Place here</button>
    <button type="button" class="hidden" id="grow">Add sidewalk and street</button>
    <button type="button" id="strike" class="hidden">Strike</button>
    <div class="cards hidden" id="next-houses"></div>
  </section>
`

const canvas = document.querySelector('#view')
const world = createWorld(canvas)
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
  move.classList.toggle('hidden', state.screen === 'fight' || state.screen === 'street')
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
      ? `${house.furniture.length} placed. Walk, turn, and put down ${left} more.`
      : 'The room is furnished.'
  } else if (state.screen === 'kept' && house) {
    status.textContent = `${house.name} stays decorated. Walk around, then add the sidewalk and the street.`
  } else if (state.screen === 'street') {
    const names = state.street.map((piece) => STREET_PIECES.find((item) => item.id === piece.kind)?.name)
    status.textContent = names.length === 0
      ? 'Place something on the sidewalk and something in the street. Then choose the next house.'
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
  if (event.target.closest('#walk')) world.nudge('forward')
  if (event.target.closest('#back')) world.nudge('back')
  if (event.target.closest('#turn-left')) world.nudge('left')
  if (event.target.closest('#turn-right')) world.nudge('right')
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

canvas.addEventListener('pointerdown', (event) => {
  lookDrag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }
})
canvas.addEventListener('pointermove', (event) => {
  if (!lookDrag || lookDrag.id !== event.pointerId) return
  const dx = event.clientX - lookDrag.x
  const dy = event.clientY - lookDrag.y
  if (Math.hypot(event.clientX - lookDrag.x, event.clientY - lookDrag.y) > 8) lookDrag.moved = true
  if (state.screen === 'fight') return
  input.lookX += dx * 0.005
  input.lookY += dy * 0.004
  lookDrag.x = event.clientX
  lookDrag.y = event.clientY
})
canvas.addEventListener('pointerup', (event) => {
  if (!lookDrag || lookDrag.id !== event.pointerId) return
  const tap = !lookDrag.moved
  lookDrag = null
  if (!tap) return
  if (state.screen !== 'decorate') return
  const hit = world.rayPlace(event.clientX, event.clientY)
  if (hit) onPlace(hit)
})
canvas.addEventListener('pointercancel', () => {
  lookDrag = null
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp' || event.key === 'w') world.nudge('forward')
  if (event.key === 'ArrowDown' || event.key === 's') world.nudge('back')
  if (event.key === 'ArrowLeft' || event.key === 'a') world.nudge('left')
  if (event.key === 'ArrowRight' || event.key === 'd') world.nudge('right')
  if (event.key === ' ') {
    event.preventDefault()
    if (state.screen === 'fight') onStrike()
    else onPlace()
  }
})

new ResizeObserver(() => world.resize()).observe(app)

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  world.ghostKind = state.screen === 'decorate' ? selected : null
  world.update(dt, input)
  requestAnimationFrame(frame)
}

afterChange()
requestAnimationFrame(frame)
