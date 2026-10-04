export const ATTACK_AFTER = 3
export const HITS_TO_WIN = 4
export const HITS_TO_LOSE = 3

const PUNCH = { startup: 0.1, active: 0.12, recover: 0.26, range: 1.42 }
const KICK = { startup: 0.18, active: 0.14, recover: 0.34, range: 2.12 }
const NICO_ATTACK = {
  punch: { windup: 0.58, strike: 0.16, reach: 1.58 },
  kick: { windup: 0.74, strike: 0.18, reach: 2.08 },
}
const GUARD_TIME = 0.62
const RECOVER_TIME = 0.68
const STAGGER_TIME = 0.55
const HURT_TIME = 0.46
const STEP = 0.05

export const ROOMS = {
  brick: {
    name: 'Porter Brick',
    blurb: 'A wide brick room near Porter Road. Flat ceiling, side door, space to walk.',
    w: 7,
    d: 6.2,
    h: 2.8,
    wall: '#c46b52',
    trim: '#6e382c',
    exterior: '#a65240',
  },
  shotgun: {
    name: 'Shelby Shotgun',
    blurb: 'A long room in a line, the far window aimed toward the park.',
    w: 4.2,
    d: 10.2,
    h: 2.65,
    wall: '#e7d7bc',
    trim: '#8a6240',
    exterior: '#d7b48a',
  },
  skinny: {
    name: 'Gallatin Skinny',
    blurb: 'A tall narrow room, the modern infill, with the door on the side.',
    w: 3.7,
    d: 6.4,
    h: 3.45,
    wall: '#f4efe6',
    trim: '#1f7a72',
    exterior: '#efe6d6',
  },
}

export const FURNITURE = [
  { id: 'couch', name: 'Low couch' },
  { id: 'lamp', name: 'Corner lamp' },
  { id: 'table', name: 'Round table' },
  { id: 'plant', name: 'Potted fig' },
  { id: 'chair', name: 'Side chair' },
  { id: 'shelf', name: 'Book shelf' },
]

export const STREET_PIECES = [
  { id: 'bike', name: 'Sidewalk bike', lane: 'sidewalk' },
  { id: 'corner', name: 'Five Points corner', lane: 'street' },
  { id: 'mural', name: 'Mural wall', lane: 'sidewalk' },
  { id: 'bench', name: 'Shelby Park bench', lane: 'sidewalk' },
  { id: 'tabla', name: 'Tabla Rasa Toy Store', lane: 'sidewalk' },
  { id: 'lamppost', name: 'Street lamp', lane: 'street' },
]

const FURNITURE_IDS = new Set(FURNITURE.map((item) => item.id))
const STREET_BY_ID = Object.fromEntries(STREET_PIECES.map((item) => [item.id, item]))

export const BLOCK = {
  sidewalk: { minX: 0.35, maxX: 2.15 },
  street: { minX: 3.2, maxX: 5.6 },
  minZ: -8,
  maxZ: 9,
}

export function houseFootprint(index) {
  const z = 3.2 - index * 4.4
  return { minX: -3.05, maxX: -0.2, minZ: z - 1.55, maxZ: z + 1.55, z }
}

function overlaps(x, z, box, pad) {
  return x > box.minX - pad && x < box.maxX + pad && z > box.minZ - pad && z < box.maxZ + pad
}

export function classifyGround(x, z, houseCount) {
  for (let i = 0; i < houseCount; i += 1) {
    if (overlaps(x, z, houseFootprint(i), 0)) return 'house'
  }
  if (x >= BLOCK.sidewalk.minX && x <= BLOCK.sidewalk.maxX && z >= BLOCK.minZ && z <= BLOCK.maxZ) return 'sidewalk'
  if (x >= BLOCK.street.minX && x <= BLOCK.street.maxX && z >= BLOCK.minZ && z <= BLOCK.maxZ) return 'street'
  return 'yard'
}

function nearPiece(x, z, existing) {
  return existing.some((item) => {
    const dx = x - item.x
    const dz = z - item.z
    return dx * dx + dz * dz < 0.95 * 0.95
  })
}

function furthestOnLane(lane, feetX, feetZ, aimX, aimZ, houseCount) {
  let best = null
  for (let t = 1; t >= 0; t -= 0.12) {
    const x = feetX + (aimX - feetX) * t
    const z = feetZ + (aimZ - feetZ) * t
    if (classifyGround(x, z, houseCount) === lane) best = best || { x, z }
    if (best) break
  }
  return best
}

export function bloopSpot(lane, feetX, feetZ, aimX, aimZ, existing, houseCount) {
  const fx = Number(feetX) || 0
  const fz = Number(feetZ) || 0
  const ax = Number.isFinite(Number(aimX)) ? Number(aimX) : fx
  const az = Number.isFinite(Number(aimZ)) ? Number(aimZ) : fz
  const ground = classifyGround(fx, fz, houseCount)
  const preview = { x: ax, z: az }
  if (ground !== lane) return { ok: false, reason: 'surface', ground, x: preview.x, z: preview.z }
  const visible = furthestOnLane(lane, fx, fz, ax, az, houseCount) || { x: fx, z: fz }
  const snapped = { x: Math.round(visible.x * 2) / 2, z: Math.round(visible.z * 2) / 2 }
  const candidates = [snapped, visible]
  for (const ox of [-0.5, 0.5, 0]) {
    for (const oz of [-0.5, 0, 0.5]) candidates.push({ x: snapped.x + ox, z: snapped.z + oz })
  }
  for (const spot of candidates) {
    if (Math.hypot(spot.x - fx, spot.z - fz) > 1.15) continue
    if (classifyGround(spot.x, spot.z, houseCount) !== lane) continue
    if (nearPiece(spot.x, spot.z, existing)) continue
    return { ok: true, reason: 'ok', ground, x: spot.x, z: spot.z }
  }
  return { ok: false, reason: 'crowded', ground, x: visible.x, z: visible.z }
}

export function createState() {
  return {
    screen: 'pick',
    serial: 0,
    kept: [],
    draft: null,
    focusId: null,
    street: [],
    fight: null,
  }
}

export function activeHouse(state) {
  if (state.screen === 'kept') {
    return state.kept.find((house) => house.uid === state.focusId) || state.kept.at(-1) || null
  }
  return state.draft
}

export function streetReady(state) {
  const lanes = new Set(state.street.map((piece) => piece.lane))
  return lanes.has('sidewalk') && lanes.has('street')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function clampInside(style, x, z) {
  const room = ROOMS[style]
  const margin = 0.55
  return {
    x: clamp(x, -room.w / 2 + margin, room.w / 2 - margin),
    z: clamp(z, -room.d / 2 + margin, room.d / 2 - margin),
  }
}

export function createFight() {
  return {
    playerHits: 0,
    nicoHits: 0,
    nicoPhase: 'approach',
    nicoAttack: 'punch',
    phaseT: 0,
    playerMove: 'ready',
    moveT: 0,
    swingResolved: false,
    strikeResolved: false,
    heldPunch: false,
    heldKick: false,
    over: null,
  }
}

function moveSpec(move) {
  return move === 'kick' ? KICK : PUNCH
}

function finishIfNeeded(fight, events) {
  if (fight.playerHits >= HITS_TO_WIN) fight.over = 'win'
  else if (fight.nicoHits >= HITS_TO_LOSE) fight.over = 'lose'
  return { fight, events, done: fight.over }
}

function connectPlayer(fight, distance, events) {
  const spec = moveSpec(fight.playerMove)
  fight.swingResolved = true
  if (distance > spec.range) {
    events.push('whiff')
    return
  }
  if (fight.nicoPhase === 'guard' || fight.nicoPhase === 'approach' || fight.nicoPhase === 'stagger') {
    events.push('clang')
    return
  }
  if (fight.nicoPhase === 'strike') {
    events.push('late')
    return
  }
  fight.playerHits += 1
  const counter = fight.nicoPhase === 'windup'
  fight.nicoPhase = 'stagger'
  fight.phaseT = 0
  fight.strikeResolved = true
  events.push(counter ? 'counter' : 'hit')
}

function resolveStrike(fight, distance, events) {
  fight.strikeResolved = true
  const reach = NICO_ATTACK[fight.nicoAttack].reach
  if (distance > reach) {
    events.push('nico-whiff')
    return
  }
  if (fight.playerMove === 'block') {
    events.push('blocked')
    return
  }
  if (fight.playerMove === 'hurt') return
  fight.nicoHits += 1
  fight.playerMove = 'hurt'
  fight.moveT = 0
  fight.swingResolved = true
  events.push('hurt')
}

function advanceOnce(fight, dt, input, edges) {
  if (fight.over) return { fight, events: [], done: fight.over }
  const events = []
  const distance = Number(input.distance) || 0
  const punchEdge = Boolean(edges.punch)
  const kickEdge = Boolean(edges.kick)

  if (fight.playerMove === 'ready' || fight.playerMove === 'block') {
    if ((punchEdge || kickEdge)) {
      fight.playerMove = kickEdge && !punchEdge ? 'kick' : 'punch'
      fight.moveT = 0
      fight.swingResolved = false
      events.push(fight.playerMove === 'kick' ? 'swing-kick' : 'swing-punch')
    } else if (input.block && fight.playerMove === 'ready') fight.playerMove = 'block'
    else if (!input.block && fight.playerMove === 'block') fight.playerMove = 'ready'
  }

  if (fight.playerMove === 'punch' || fight.playerMove === 'kick') {
    const spec = moveSpec(fight.playerMove)
    const before = fight.moveT
    fight.moveT += dt
    const activeStart = spec.startup
    const activeEnd = spec.startup + spec.active
    if (!fight.swingResolved && before < activeEnd && fight.moveT >= activeStart) connectPlayer(fight, distance, events)
    if (fight.moveT >= activeEnd + spec.recover) fight.playerMove = input.block ? 'block' : 'ready'
  } else if (fight.playerMove === 'hurt') {
    fight.moveT += dt
    if (fight.moveT >= HURT_TIME) fight.playerMove = input.block ? 'block' : 'ready'
  }

  if (fight.nicoPhase !== 'stagger') {
    fight.phaseT += dt
    const attack = NICO_ATTACK[fight.nicoAttack]
    if (fight.nicoPhase === 'approach' && distance < 2.2) {
      fight.nicoPhase = 'guard'
      fight.phaseT = 0
    } else if (fight.nicoPhase === 'guard' && distance > 2.65) {
      fight.nicoPhase = 'approach'
      fight.phaseT = 0
    } else if (fight.nicoPhase === 'guard' && fight.phaseT >= GUARD_TIME) {
      fight.nicoAttack = distance > 1.72 ? 'kick' : 'punch'
      fight.nicoPhase = 'windup'
      fight.phaseT = 0
      fight.strikeResolved = false
      events.push('telegraph')
    } else if (fight.nicoPhase === 'windup' && fight.phaseT >= attack.windup) {
      fight.nicoPhase = 'strike'
      fight.phaseT = 0
      resolveStrike(fight, distance, events)
    } else if (fight.nicoPhase === 'strike' && fight.phaseT >= attack.strike) {
      fight.nicoPhase = 'recover'
      fight.phaseT = 0
    } else if (fight.nicoPhase === 'recover' && fight.phaseT >= RECOVER_TIME) {
      fight.nicoPhase = distance > 2.45 ? 'approach' : 'guard'
      fight.phaseT = 0
    }
  } else {
    fight.phaseT += dt
    if (fight.phaseT >= STAGGER_TIME) {
      fight.nicoPhase = 'guard'
      fight.phaseT = 0
    }
  }

  return finishIfNeeded(fight, events)
}

export function advanceFight(fight, dt, input = {}) {
  let current = fight
  const punchEdge = Boolean(input.punch) && !current.heldPunch
  const kickEdge = Boolean(input.kick) && !current.heldKick
  current.heldPunch = Boolean(input.punch)
  current.heldKick = Boolean(input.kick)
  let edges = { punch: punchEdge, kick: kickEdge }
  let events = []
  let left = Math.max(0, dt)
  while (left > 0) {
    const step = Math.min(STEP, left)
    const out = advanceOnce(current, step, input, edges)
    current = out.fight
    events = events.concat(out.events)
    edges = { punch: false, kick: false }
    if (out.done) return { fight: current, events, done: out.done }
    left -= step
  }
  return { fight: current, events, done: current.over }
}

export function withFight(state, fight) {
  if (state.screen !== 'fight') return state
  if (fight.over === 'win' || fight.playerHits >= HITS_TO_WIN) return winFight(state)
  if (fight.over === 'lose' || fight.nicoHits >= HITS_TO_LOSE) return loseFight(state)
  return { ...state, fight }
}

export function fightReadout(fight, distance) {
  const score = `Crown ${fight.playerHits}/${HITS_TO_WIN} · You ${fight.nicoHits}/${HITS_TO_LOSE}`
  let line = 'Nico from Five Points closes in.'
  if (fight.playerMove === 'hurt') line = 'Bonk. Hands up.'
  else if (fight.nicoPhase === 'windup') {
    line = fight.nicoAttack === 'kick' ? 'He chambers a kick. Counter or block.' : 'He chambers a punch. Counter or block.'
  } else if (fight.nicoPhase === 'strike') line = 'Block, or step back.'
  else if (fight.nicoPhase === 'recover') line = "He's open."
  else if (fight.nicoPhase === 'stagger') line = 'Nice. Reset your feet.'
  else if (distance > 2.25) line = 'Close the gap. A kick reaches farther than a punch.'
  else line = "He's covered. Wait for the windup."
  return { score, line }
}

function winFight(state) {
  const house = { ...state.draft, furniture: state.draft.furniture.map((item) => ({ ...item })) }
  return {
    ...state,
    screen: 'kept',
    kept: [...state.kept, house],
    focusId: house.uid,
    draft: null,
    fight: null,
  }
}

function loseFight(state) {
  return {
    ...state,
    screen: 'rebuild',
    draft: { ...state.draft, furniture: [], attacked: false },
    fight: null,
  }
}

export function reduce(state, action, payload = {}) {
  switch (action) {
    case 'choose-house': {
      if (state.screen !== 'pick' && state.screen !== 'street') return state
      if (state.screen === 'street' && !streetReady(state)) return state
      const style = payload.house
      if (!ROOMS[style]) return state
      const serial = state.serial + 1
      const draft = {
        uid: `house-${serial}`,
        style,
        name: ROOMS[style].name,
        lot: state.kept.length + 1,
        furniture: [],
        attacked: false,
      }
      return {
        ...state,
        serial,
        draft,
        focusId: draft.uid,
        screen: 'decorate',
        fight: null,
      }
    }
    case 'place': {
      if (state.screen !== 'decorate' || !state.draft || state.draft.attacked) return state
      if (!FURNITURE_IDS.has(payload.kind)) return state
      const spot = clampInside(state.draft.style, Number(payload.x) || 0, Number(payload.z) || 0)
      const serial = state.serial + 1
      const furniture = [
        ...state.draft.furniture,
        {
          id: `f-${serial}`,
          kind: payload.kind,
          x: spot.x,
          z: spot.z,
          rot: Number(payload.rot) || 0,
        },
      ]
      const draft = { ...state.draft, furniture }
      if (furniture.length >= ATTACK_AFTER) {
        return {
          ...state,
          serial,
          draft: { ...draft, attacked: true },
          screen: 'fight',
          fight: createFight(),
        }
      }
      return { ...state, serial, draft }
    }
    case 'to-street': {
      if (state.screen !== 'kept') return state
      return { ...state, screen: 'street' }
    }
    case 'place-street': {
      if (state.screen !== 'street') return state
      const piece = STREET_BY_ID[payload.kind]
      if (!piece) return state
      const spot = bloopSpot(piece.lane, payload.x, payload.z, payload.ax, payload.az, state.street, state.kept.length)
      if (!spot.ok) return state
      const serial = state.serial + 1
      return {
        ...state,
        serial,
        street: [
          ...state.street,
          {
            id: `s-${serial}`,
            kind: piece.id,
            lane: piece.lane,
            x: spot.x,
            z: spot.z,
            rot: Number(payload.rot) || 0,
            settled: false,
          },
        ],
      }
    }
    case 'decorate-again': {
      if (state.screen !== 'rebuild' || !state.draft) return state
      return { ...state, screen: 'decorate', fight: null }
    }
    default:
      return state
  }
}
