import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BLOCK,
  FURNITURE,
  HITS_TO_LOSE,
  HITS_TO_WIN,
  advanceFight,
  bloopSpot,
  createFight,
  createState,
  houseFootprint,
  reduce,
  streetReady,
  withFight,
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

function spar(state, inputFor) {
  let fight = state.fight
  for (let i = 0; i < 500 && state.screen === 'fight'; i += 1) {
    const step = advanceFight(fight, 0.05, inputFor(fight))
    fight = step.fight
    state = withFight(state, fight)
  }
  return state
}

function winFight(state) {
  return spar(state, (fight) => ({
    distance: 1.2,
    punch: fight.nicoPhase === 'windup' && fight.phaseT > 0.14 && fight.playerMove === 'ready',
    kick: false,
    block: false,
  }))
}

function loseFight(state) {
  return spar(state, () => ({ distance: 1.2, punch: false, kick: false, block: false }))
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
  assert.equal(state.fight.nicoPhase, 'approach')
  state = loseFight(state)
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
  state = reduce(state, 'place-street', { kind: 'bike', x: 1.15, z: 2 })
  state = reduce(state, 'place-street', { kind: 'mural', x: 1.15, z: 4.2 })
  assert.equal(streetReady(state), false)
  state = reduce(state, 'place-street', { kind: 'corner', x: 4.3, z: 2 })
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

test('a sidewalk piece bloops where you stand, and a street piece will not', () => {
  const lot = houseFootprint(0)
  const sidewalk = bloopSpot('sidewalk', 1.2, 2, 1.35, 2.7, [], 1)
  assert.equal(sidewalk.ok, true)
  assert.ok(sidewalk.x >= BLOCK.sidewalk.minX && sidewalk.x <= BLOCK.sidewalk.maxX)
  assert.ok(sidewalk.x > lot.maxX)
  assert.ok(Math.hypot(sidewalk.x - 1.2, sidewalk.z - 2) <= 1.15)
  const fromRoad = bloopSpot('sidewalk', 4.3, 2, 4.3, 2.6, [], 1)
  assert.equal(fromRoad.ok, false)
  assert.equal(fromRoad.reason, 'surface')
  const road = bloopSpot('street', 4.3, 1.4, 4.5, 1.4, [], 1)
  assert.equal(road.ok, true)
  assert.ok(road.x >= BLOCK.street.minX && road.x <= BLOCK.street.maxX)
  const inHouse = bloopSpot('sidewalk', (lot.minX + lot.maxX) / 2, lot.z, 1.2, lot.z, [], 1)
  assert.equal(inHouse.ok, false)
  const first = bloopSpot('sidewalk', 1.2, 2, 1.2, 2.4, [], 0)
  const second = bloopSpot('sidewalk', 1.2, 2, 1.2, 2.4, [first], 0)
  if (second.ok) {
    const dx = first.x - second.x
    const dz = first.z - second.z
    assert.ok(dx * dx + dz * dz > 0.8)
    assert.ok(Math.hypot(second.x - 1.2, second.z - 2) <= 1.15)
  } else {
    assert.equal(second.reason, 'crowded')
  }
})

test('punch, kick, and block are different choices', () => {
  const punched = advanceFight({ ...createFight(), nicoPhase: 'recover', phaseT: 0.2 }, 0.4, { distance: 1.9, punch: true })
  assert.equal(punched.fight.playerHits, 0)
  assert.ok(punched.events.includes('whiff'))
  const kicked = advanceFight({ ...createFight(), nicoPhase: 'recover', phaseT: 0.2 }, 0.45, { distance: 1.9, kick: true })
  assert.equal(kicked.fight.playerHits, 1)
  assert.ok(kicked.events.includes('hit'))

  let guarding = createFight()
  let blocked = false
  for (let i = 0; i < 80; i += 1) {
    const step = advanceFight(guarding, 0.05, { distance: 1.3, block: true })
    guarding = step.fight
    if (step.events.includes('blocked')) blocked = true
  }
  assert.equal(blocked, true)
  assert.equal(guarding.nicoHits, 0)

  const whiffed = advanceFight(
    { ...createFight(), nicoPhase: 'windup', nicoAttack: 'punch', phaseT: 0.5 },
    0.2,
    { distance: 3 },
  )
  assert.equal(whiffed.fight.nicoHits, 0)
  assert.ok(whiffed.events.includes('nico-whiff'))
})

test('losing the second house does not erase the first house or the street', () => {
  let state = reduce(createState(), 'choose-house', { house: 'brick' })
  state = winFight(decorateThree(state))
  state = reduce(state, 'to-street')
  state = reduce(state, 'place-street', { kind: 'bench', x: 1.2, z: 1 })
  state = reduce(state, 'place-street', { kind: 'lamppost', x: 4.4, z: 1 })
  state = reduce(state, 'choose-house', { house: 'shotgun' })
  state = decorateThree(state)
  state = loseFight(state)
  assert.equal(state.screen, 'rebuild')
  assert.equal(state.draft.furniture.length, 0)
  assert.equal(state.draft.name, 'Shelby Shotgun')
  assert.equal(state.kept[0].furniture.length, 3)
  assert.equal(state.street.length, 2)
  assert.equal(HITS_TO_WIN, 4)
  assert.equal(HITS_TO_LOSE, 3)
})
