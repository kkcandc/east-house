import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BLOCK,
  FURNITURE,
  HITS_TO_WIN,
  MISSES_TO_LOSE,
  createState,
  houseFootprint,
  placeOnLane,
  reduce,
  streetReady,
} from '../src/logic.js'

function placePiece(state, kind, x, z) {
  return reduce(state, 'place', { kind, x, z, rot: 0.2 })
}

function decorateThree(state) {
  let next = placePiece(state, 'lamp', 0, -0.4)
  next = placePiece(next, 'couch', 1.2, -0.2)
  next = placePiece(next, 'plant', -1.1, -1)
  return next
}

function winFight(state) {
  let next = state
  while (next.screen === 'fight') {
    next = reduce(next, 'open-window')
    next = reduce(next, 'strike')
  }
  return next
}

test('three placements stay put and bring on the fight', () => {
  let state = reduce(createState(), 'choose-house', { house: 'brick' })
  assert.equal(state.draft.name, 'Porter Brick')
  state = placePiece(state, 'lamp', 0.2, -0.5)
  state = placePiece(state, 'couch', 1.4, -0.4)
  assert.equal(state.screen, 'decorate')
  state = placePiece(state, 'plant', -1.2, -1.1)
  assert.equal(state.screen, 'fight')
  assert.equal(state.draft.furniture.length, 3)
  const spots = state.draft.furniture.map((item) => `${item.kind}:${item.x.toFixed(2)},${item.z.toFixed(2)}`)
  assert.equal(new Set(spots).size, 3)
  assert.ok(state.draft.furniture.every((item) => FURNITURE.some((kind) => kind.id === item.kind)))
})

test('a lost fight clears only the house you were decorating', () => {
  let state = reduce(createState(), 'choose-house', { house: 'shotgun' })
  state = decorateThree(state)
  assert.equal(state.fight.kind, 'punch')
  state = reduce(state, 'strike')
  assert.equal(state.fight.misses, 1)
  state = reduce(state, 'open-window')
  state = reduce(state, 'whiff')
  assert.equal(state.screen, 'rebuild')
  assert.equal(state.draft.furniture.length, 0)
  assert.equal(state.draft.name, 'Shelby Shotgun')
  assert.equal(state.kept.length, 0)
  state = reduce(state, 'decorate-again')
  assert.equal(state.screen, 'decorate')
  assert.equal(state.draft.furniture.length, 0)
})

test('a win keeps the furniture and opens another house after the street', () => {
  let state = reduce(createState(), 'choose-house', { house: 'skinny' })
  state = decorateThree(state)
  state = winFight(state)
  assert.equal(state.screen, 'kept')
  assert.equal(state.kept.length, 1)
  assert.equal(state.kept[0].furniture.length, 3)
  assert.equal(state.kept[0].name, 'Gallatin Skinny')
  state = reduce(state, 'to-street')
  assert.equal(streetReady(state), false)
  state = reduce(state, 'place-street', { kind: 'bike' })
  state = reduce(state, 'place-street', { kind: 'mural' })
  assert.equal(streetReady(state), false)
  state = reduce(state, 'place-street', { kind: 'corner' })
  assert.equal(streetReady(state), true)
  assert.deepEqual(
    state.street.map((piece) => piece.kind),
    ['bike', 'mural', 'corner'],
  )
  const blocked = reduce(state, 'choose-house', { house: 'brick' })
  assert.notEqual(blocked.screen, 'pick')
  state = blocked
  assert.equal(state.screen, 'decorate')
  assert.equal(state.draft.name, 'Porter Brick')
  assert.equal(state.draft.lot, 2)
  assert.equal(state.draft.furniture.length, 0)
  assert.equal(state.kept[0].furniture.length, 3)
  assert.equal(state.street.length, 3)
})

test('sidewalk and street pieces sit on their own ground, not in a house', () => {
  const lot = houseFootprint(0)
  const sidewalk = placeOnLane('sidewalk', lot.minX, lot.z, [], 1)
  assert.ok(sidewalk.x >= BLOCK.sidewalk.minX && sidewalk.x <= BLOCK.sidewalk.maxX)
  assert.ok(sidewalk.x > lot.maxX)
  const road = placeOnLane('street', 0, 1.2, [], 1)
  assert.ok(road.x >= BLOCK.street.minX && road.x <= BLOCK.street.maxX)
  const first = placeOnLane('sidewalk', 1.1, 2, [], 0)
  const second = placeOnLane('sidewalk', 1.1, 2, [first], 0)
  const dx = first.x - second.x
  const dz = first.z - second.z
  assert.ok(dx * dx + dz * dz > 1)
})

test('losing the second house does not erase the first house or the street', () => {
  let state = reduce(createState(), 'choose-house', { house: 'brick' })
  state = winFight(decorateThree(state))
  state = reduce(state, 'to-street')
  state = reduce(state, 'place-street', { kind: 'bench' })
  state = reduce(state, 'place-street', { kind: 'lamppost' })
  state = reduce(state, 'choose-house', { house: 'shotgun' })
  state = decorateThree(state)
  for (let i = 0; i < MISSES_TO_LOSE; i += 1) {
    state = reduce(state, 'open-window')
    state = reduce(state, 'whiff')
  }
  assert.equal(state.screen, 'rebuild')
  assert.equal(state.draft.furniture.length, 0)
  assert.equal(state.draft.name, 'Shelby Shotgun')
  assert.equal(state.kept[0].furniture.length, 3)
  assert.equal(state.street.length, 2)
  assert.equal(HITS_TO_WIN, 3)
})
