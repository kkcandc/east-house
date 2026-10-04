export const HOUSE_TYPES = [
  {
    style: 'brick',
    name: 'Porter Brick',
    blurb: 'A low brick square near Porter Road. Flat roof, side door, two rooms side by side.',
  },
  {
    style: 'shotgun',
    name: 'Shelby Shotgun',
    blurb: 'A long run of rooms in a line. The door sits on the short end, toward the park.',
  },
  {
    style: 'skinny',
    name: 'Gallatin Skinny',
    blurb: 'A narrow modern infill. Thin from above, with the door tucked on the side.',
  },
]

export const START_ROOMS = {
  brick: ['living', 'kitchen'],
  shotgun: ['living', 'sleep'],
  skinny: ['living', 'studio'],
}

export const EXTRA_ROOMS = ['sunroom', 'nook', 'pantry', 'plants', 'maps']

export const ROOM_LABELS = {
  living: 'Living room',
  kitchen: 'Kitchen',
  sleep: 'Sleep room',
  studio: 'Studio',
  sunroom: 'Sunroom',
  nook: 'Reading nook',
  pantry: 'Snack pantry',
  plants: 'Plant room',
  maps: 'Map nook',
}

export const SHOW = [
  {
    id: 'heat',
    kicker: 'Round 1',
    prompt:
      'This drumstick is wearing sunglasses, and the sunglasses just melted. What heat is that?',
    choices: [
      { id: 'polite', label: 'Polite Pepper' },
      { id: 'sweaty', label: 'Sweaty Smile' },
      { id: 'volcano', label: 'Cartoon Volcano' },
    ],
    answer: 'volcano',
    yes: 'Pip rings a tiny bell. Cartoon Volcano. The sunglasses have retired.',
    no: 'Pip consults a pickle. That is not the heat.',
  },
  {
    id: 'pickles',
    kicker: 'Round 2',
    prompt: 'Count the pickles on the plate. They are bright green and sitting in plain sight.',
    choices: [
      { id: 'three', label: '3 pickles' },
      { id: 'four', label: '4 pickles' },
      { id: 'nine', label: '9 pickles' },
    ],
    answer: 'four',
    yes: 'Four pickles. Pip bows so low the microphone squeaks.',
    no: 'Pip counts again, slowly, with one polite finger.',
  },
  {
    id: 'cushion',
    kicker: 'Round 3',
    prompt: 'The hot chicken is under the cushion with the star. Which cushion is that?',
    choices: [
      { id: 'star', label: 'Star cushion' },
      { id: 'plain', label: 'Plain cushion' },
      { id: 'plant', label: 'The houseplant' },
    ],
    answer: 'star',
    yes: 'Correct. The houseplant is relieved. It was not a cushion.',
    no: 'The star cushion rustles. Pip points at it again.',
  },
]

export const POSES = [
  {
    id: 'flamingo',
    name: 'Flamingo Mailbox',
    detail: 'One leg up. One arm straight out like a mailbox flag.',
  },
  {
    id: 'pizza',
    name: 'Pizza Roof',
    detail: 'Both arms up in a pointy roof.',
  },
  {
    id: 'bicycle',
    name: 'Sleepy Bicycle',
    detail: 'Arms out like handlebars. Eyes closed.',
  },
]

export function poseById(id) {
  return POSES.find((pose) => pose.id === id)
}

export function createState() {
  return {
    screen: 'pick',
    serial: 0,
    kept: [],
    draft: null,
    focusId: null,
    tvDone: false,
    tennisDone: false,
    showIndex: 0,
    showScore: 0,
    showLocked: false,
    showRight: null,
    showChoice: null,
    poseOrder: [],
    poseIndex: 0,
    poseOptions: [],
    poseNote: '',
    lastRoom: null,
    missedPose: null,
    wantedPose: null,
    lostName: null,
    lostStyle: null,
  }
}

export function activeHouse(state) {
  if (state.draft) return state.draft
  return state.kept.find((house) => house.uid === state.focusId) || state.kept.at(-1) || null
}

export function canKnock(state) {
  return Boolean(state.draft) && state.tvDone && state.tennisDone && state.screen === 'house'
}

export function isNeighborhood(state) {
  return state.kept.length >= 3
}

function blankShow(state) {
  return {
    ...state,
    showIndex: 0,
    showScore: 0,
    showLocked: false,
    showRight: null,
    showChoice: null,
  }
}

export function shuffle(list, rng) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function nextPoseSlice(order, index, rng) {
  return {
    poseOrder: order,
    poseIndex: index,
    poseOptions: shuffle(
      POSES.map((pose) => pose.id),
      rng,
    ),
    poseNote: index === 0 ? '' : 'Copied.',
  }
}

function clearedLost() {
  return { lostName: null, lostStyle: null, missedPose: null, wantedPose: null }
}

export function reduce(state, action, payload = {}, rng = Math.random) {
  switch (action) {
    case 'choose-house': {
      if (state.screen !== 'pick') return state
      const style = payload.house
      const type = HOUSE_TYPES.find((house) => house.style === style)
      if (!type) return state
      const serial = state.serial + 1
      const draft = {
        uid: `house-${serial}`,
        style,
        name: type.name,
        lot: state.kept.length + 1,
        rooms: [...START_ROOMS[style]],
      }
      return {
        ...blankShow(state),
        ...clearedLost(),
        serial,
        draft,
        focusId: draft.uid,
        screen: 'house',
        tvDone: false,
        tennisDone: false,
        poseOrder: [],
        poseIndex: 0,
        poseOptions: [],
        poseNote: '',
        lastRoom: null,
      }
    }
    case 'open-tv': {
      if (state.screen !== 'house') return state
      return { ...blankShow(state), screen: 'tv' }
    }
    case 'tv-answer': {
      if (state.screen !== 'tv' || state.showLocked) return state
      const question = SHOW[state.showIndex]
      if (!question || !question.choices.some((choice) => choice.id === payload.choice)) return state
      const right = payload.choice === question.answer
      return {
        ...state,
        showLocked: true,
        showRight: right,
        showChoice: payload.choice,
        showScore: state.showScore + (right ? 1 : 0),
      }
    }
    case 'tv-next': {
      if (state.screen !== 'tv' || !state.showLocked) return state
      if (state.showIndex + 1 >= SHOW.length) return { ...state, screen: 'tv-result' }
      return {
        ...state,
        showIndex: state.showIndex + 1,
        showLocked: false,
        showRight: null,
        showChoice: null,
      }
    }
    case 'tv-close': {
      if (state.screen !== 'tv-result' && state.screen !== 'tv') return state
      const finished = state.screen === 'tv-result'
      return { ...state, screen: 'house', tvDone: state.tvDone || finished }
    }
    case 'open-tennis': {
      if (state.screen !== 'house') return state
      return { ...state, screen: 'tennis' }
    }
    case 'tennis-back': {
      if (state.screen !== 'tennis') return state
      return { ...state, screen: 'house' }
    }
    case 'tennis-won': {
      if (state.screen !== 'tennis') return state
      return { ...state, screen: 'house', tennisDone: true }
    }
    case 'open-knock': {
      if (!canKnock(state)) return state
      return { ...state, screen: 'knock' }
    }
    case 'start-poses': {
      if (state.screen !== 'knock') return state
      const order = shuffle(
        POSES.map((pose) => pose.id),
        rng,
      )
      return { ...state, screen: 'pose', ...nextPoseSlice(order, 0, rng), poseNote: '' }
    }
    case 'pose': {
      if (state.screen !== 'pose' || !state.draft) return state
      const want = state.poseOrder[state.poseIndex]
      if (!want || !poseById(payload.pose)) return state
      if (payload.pose !== want) {
        return {
          ...state,
          lostName: state.draft.name,
          lostStyle: state.draft.style,
          draft: null,
          screen: 'whimper',
          tvDone: false,
          tennisDone: false,
          missedPose: payload.pose,
          wantedPose: want,
          poseNote: '',
        }
      }
      if (state.poseIndex + 1 >= state.poseOrder.length) {
        const room = EXTRA_ROOMS.find((id) => !state.draft.rooms.includes(id)) || 'maps'
        const house = { ...state.draft, rooms: [...state.draft.rooms, room] }
        return {
          ...state,
          ...clearedLost(),
          kept: [...state.kept, house],
          draft: null,
          focusId: house.uid,
          lastRoom: room,
          screen: 'win',
          tvDone: false,
          tennisDone: false,
          poseNote: '',
        }
      }
      return { ...state, ...nextPoseSlice(state.poseOrder, state.poseIndex + 1, rng) }
    }
    case 'see-house': {
      if (state.screen !== 'win' && state.screen !== 'neighborhood') return state
      return { ...state, screen: 'house' }
    }
    case 'build-another': {
      if ((state.screen !== 'win' && state.screen !== 'house') || state.draft) return state
      if (isNeighborhood(state)) return { ...state, screen: 'neighborhood' }
      return { ...state, screen: 'pick' }
    }
    case 'rebuild': {
      if (state.screen !== 'whimper') return state
      return {
        ...state,
        ...clearedLost(),
        screen: 'pick',
        draft: null,
        tvDone: false,
        tennisDone: false,
      }
    }
    case 'see-neighborhood': {
      if (!isNeighborhood(state)) return state
      if (state.screen !== 'win' && state.screen !== 'house') return state
      return { ...state, screen: 'neighborhood' }
    }
    case 'new-block': {
      if (state.screen !== 'neighborhood') return state
      return createState()
    }
    default:
      return state
  }
}
