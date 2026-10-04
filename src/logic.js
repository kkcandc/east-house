export const ATTACK_AFTER = 3
export const HITS_TO_WIN = 3
export const MISSES_TO_LOSE = 2

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
  { id: 'mural', name: 'Mural wall', lane: 'sidewalk' },
  { id: 'bench', name: 'Shelby Park bench', lane: 'sidewalk' },
  { id: 'tabla', name: 'Tabla Rasa Toy Store', lane: 'sidewalk' },
  { id: 'corner', name: 'Five Points corner', lane: 'street' },
  { id: 'lamppost', name: 'Street lamp', lane: 'street' },
]

const FURNITURE_IDS = new Set(FURNITURE.map((item) => item.id))
const STREET_BY_ID = Object.fromEntries(STREET_PIECES.map((item) => [item.id, item]))

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

function separate(items, x, z, style) {
  let nx = x
  let nz = z
  for (let n = 0; n < 8; n += 1) {
    const crowded = items.some((item) => {
      const dx = nx - item.x
      const dz = nz - item.z
      return dx * dx + dz * dz < 0.72
    })
    if (!crowded) break
    const angle = n * 1.15
    nx = x + Math.cos(angle) * (0.85 + n * 0.12)
    nz = z + Math.sin(angle) * (0.85 + n * 0.12)
  }
  return clampInside(style, nx, nz)
}

function freshFight() {
  return { hits: 0, misses: 0, round: 1, kind: 'punch', open: false }
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

function applyHit(state) {
  const hits = state.fight.hits + 1
  if (hits >= HITS_TO_WIN) return winFight(state)
  return {
    ...state,
    fight: {
      hits,
      misses: state.fight.misses,
      round: state.fight.round + 1,
      kind: state.fight.kind === 'punch' ? 'kick' : 'punch',
      open: false,
    },
  }
}

function applyMiss(state) {
  const misses = state.fight.misses + 1
  if (misses >= MISSES_TO_LOSE) return loseFight(state)
  return {
    ...state,
    fight: {
      hits: state.fight.hits,
      misses,
      round: state.fight.round + 1,
      kind: state.fight.kind === 'punch' ? 'kick' : 'punch',
      open: false,
    },
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
      const spot = separate(
        state.draft.furniture,
        Number(payload.x) || 0,
        Number(payload.z) || 0,
        state.draft.style,
      )
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
          fight: freshFight(),
        }
      }
      return { ...state, serial, draft }
    }
    case 'open-window': {
      if (state.screen !== 'fight' || !state.fight || state.fight.open) return state
      return { ...state, fight: { ...state.fight, open: true } }
    }
    case 'strike': {
      if (state.screen !== 'fight' || !state.fight) return state
      return state.fight.open ? applyHit(state) : applyMiss(state)
    }
    case 'whiff': {
      if (state.screen !== 'fight' || !state.fight?.open) return state
      return applyMiss(state)
    }
    case 'to-street': {
      if (state.screen !== 'kept') return state
      return { ...state, screen: 'street' }
    }
    case 'place-street': {
      if (state.screen !== 'street') return state
      const piece = STREET_BY_ID[payload.kind]
      if (!piece) return state
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
            slot: state.street.length,
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
