import { bikeSvg, fivePointsSvg, poseSvg } from './art.js'
import {
  HOUSE_TYPES,
  POSES,
  ROOM_LABELS,
  SHOW,
  activeHouse,
  canKnock,
  isNeighborhood,
  poseById,
} from './logic.js'

function progressLabel(state) {
  const count = state.kept.length
  if (count >= 3) return 'A neighborhood'
  if (count === 0) return 'One house at a time'
  if (count === 1) return '1 house on the block'
  return `${count} houses on the block`
}

function shell(state, body) {
  return `<div class="screen" data-screen="${state.screen}">
    <header class="top">
      <p class="mark">East House</p>
      <p class="progress">${progressLabel(state)}</p>
    </header>
    ${body}
  </div>`
}

function pocketMap(lot, street = '') {
  return `<section class="pocket" aria-label="Pocket map of East Nashville">
    <p class="map-note">Looking down. A pocket map of East Nashville, squeezed onto one block.</p>
    <div class="five-points">
      ${fivePointsSvg()}
      <p class="tag">Five Points corner</p>
    </div>
    <div class="shop-row">
      <div class="toy-store">
        <span class="awning" aria-hidden="true"></span>
        <span class="toys" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <p class="tag">Tabla Rasa Toy Store</p>
      </div>
      <div class="mural" aria-label="Mural wall">
        <span class="swatch s1"></span>
        <span class="swatch s2"></span>
        <span class="swatch s3"></span>
        <span class="swatch s4"></span>
        <p class="tag">Mural wall</p>
      </div>
    </div>
    <div class="sidewalk" aria-label="Bikes on the sidewalk">
      ${bikeSvg('#c4513a')}${bikeSvg('#1f7a72')}${bikeSvg('#d28a12')}
      <p class="tag">Bikes on the sidewalk</p>
    </div>
    <div class="lot">${lot}</div>
    <div class="street">
      <span class="lane" aria-hidden="true"></span>
      <p class="tag">The street</p>
      ${street}
    </div>
    <div class="park" aria-label="Shelby Park">
      <span class="pond"></span>
      <span class="path"></span>
      <span class="tree"></span>
      <span class="tree t2"></span>
      <span class="tree t3"></span>
      <p class="tag">Shelby Park</p>
    </div>
  </section>`
}

function furniture(room) {
  const bits = {
    kitchen: '<span class="table"></span><span class="chair c1"></span><span class="chair c2"></span><span class="chair c3"></span><span class="chair c4"></span>',
    sleep: '<span class="bed"><span class="pillow"></span></span>',
    studio: '<span class="desk"></span><span class="stool"></span>',
    sunroom: '<span class="plant"></span><span class="plant p2"></span>',
    nook: '<span class="book"></span><span class="book b2"></span><span class="cushion-dot"></span>',
    pantry: '<span class="jar"></span><span class="jar j2"></span><span class="jar j3"></span>',
    plants: '<span class="plant"></span><span class="plant p2"></span><span class="plant p3"></span>',
    maps: '<span class="map-sheet"></span>',
  }
  return bits[room] || ''
}

function tvButton() {
  return `<button type="button" class="tv" data-action="open-tv" aria-label="Television. Play the hot-chicken guessing show.">
    <span class="tv-screen" aria-hidden="true"><span class="drumstick"></span></span>
    <span class="tv-caption">TV</span>
  </button>`
}

function roomCard(house, room, playable, newRoom) {
  const label = ROOM_LABELS[room] || room
  const inside = room === 'living'
    ? `${playable ? tvButton() : '<span class="tv static" aria-hidden="true"><span class="tv-screen"><span class="drumstick"></span></span></span>'}<span class="couch"></span><span class="rug"></span><span class="door" aria-hidden="true"></span>`
    : furniture(room)
  return `<section class="room room-${room} ${room === newRoom ? 'is-new' : ''}" aria-label="${label}">
    <h3>${label}</h3>
    ${inside}
  </section>`
}

function dollhouse(house, { playable, newRoom }) {
  const rooms = house.rooms
    .map((room) => roomCard(house, room, playable, newRoom))
    .join('')
  return `<article class="dollhouse kind-${house.style}" aria-label="${house.name}, lot ${house.lot}">
    <header class="roof">
      <h2>${house.name}</h2>
      <p>Lot ${house.lot}</p>
    </header>
    <div class="rooms">${rooms}</div>
  </article>`
}

function courtButton() {
  return `<button type="button" class="court" data-action="open-tennis" aria-label="Tennis court. Rally with rackets.">
    <span class="court-lines" aria-hidden="true">
      <span class="mini-racket"></span>
      <span class="net"></span>
      <span class="mini-racket far"></span>
    </span>
    <span class="court-caption">Tennis court</span>
  </button>`
}

function houseChecklist(state) {
  if (!state.draft) {
    if (isNeighborhood(state)) {
      return `<div class="dock">
        <p class="status">Three houses. The block is a neighborhood.</p>
        <button type="button" class="primary" data-action="see-neighborhood">See the neighborhood</button>
      </div>`
    }
    return `<div class="dock">
      <p class="status">This house stayed. Add another and keep going.</p>
      <button type="button" class="primary" data-action="build-another">Build another house</button>
    </div>`
  }

  const tv = state.tvDone ? 'done' : ''
  const tennis = state.tennisDone ? 'done' : ''
  const ready = canKnock(state)
  return `<div class="dock">
    <ol class="checklist">
      <li class="${tv}">Hot-chicken show on the TV</li>
      <li class="${tennis}">Tennis rally</li>
      <li class="${ready ? 'ready' : ''}">Three silly poses</li>
    </ol>
    ${
      ready
        ? `<button type="button" class="primary knock" data-action="open-knock">Clive is knocking</button>`
        : `<p class="status">${state.tvDone ? 'The court is still quiet.' : state.tennisDone ? 'The TV show is still queued.' : 'Tap the TV, then the tennis court.'}</p>`
    }
  </div>`
}

function renderPick(state) {
  const kept =
    state.kept.length > 0
      ? `<p class="kept-note">${state.kept.map((house) => house.name).join(' · ')} already on the block.</p>`
      : ''
  const cards = HOUSE_TYPES.map(
    (house) => `<button type="button" class="house-card kind-${house.style}" data-action="choose-house" data-house="${house.style}">
      <span class="mini-plan" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="card-copy">
        <span class="house-name">${house.name}</span>
        <span class="house-blurb">${house.blurb}</span>
      </span>
    </button>`,
  ).join('')
  return shell(
    state,
    `<main class="pick">
      <h1>East House</h1>
      <p class="tagline">A dollhouse you look down on. Pick one of three houses.</p>
      ${kept}
      <div class="cards">${cards}</div>
      ${pocketMap('<p class="empty-lot">Your lot waits here.</p>')}
    </main>`,
  )
}

function renderHouse(state) {
  const house = activeHouse(state)
  const lot = `${dollhouse(house, { playable: true, newRoom: state.lastRoom })}${courtButton()}`
  return shell(
    state,
    `<main class="play">
      ${pocketMap(lot)}
      ${houseChecklist(state)}
    </main>`,
  )
}

function showVisual(question) {
  if (question.id === 'pickles') {
    return `<div class="plate" aria-hidden="true">${'<i class="pickle"></i>'.repeat(4)}</div>`
  }
  if (question.id === 'cushion') {
    return `<div class="cushions" aria-hidden="true"><span class="cushion starred">★</span><span class="cushion plain"></span></div>`
  }
  return `<div class="bite" aria-hidden="true"><span class="leg"></span><span class="glasses"></span></div>`
}

function renderTv(state) {
  const question = SHOW[state.showIndex]
  const choices = question.choices
    .map((choice) => {
      const marks = []
      if (state.showLocked && choice.id === question.answer) marks.push('is-yes')
      if (state.showLocked && choice.id === state.showChoice && !state.showRight) marks.push('is-no')
      return `<button type="button" class="choice ${marks.join(' ')}" data-action="tv-answer" data-choice="${choice.id}" ${state.showLocked ? 'disabled' : ''}>${choice.label}</button>`
    })
    .join('')
  const nextLabel = state.showIndex + 1 >= SHOW.length ? 'See the score' : 'Next clue'
  return shell(
    state,
    `<main class="show">
      <p class="eyebrow">On the television</p>
      <div class="bezel">
        <div class="bezel-screen">
          <p class="show-title">Heat Check</p>
          <p class="show-sub">A silly hot-chicken guessing show</p>
          ${showVisual(question)}
          <p class="kicker">${question.kicker}</p>
          <h1>${question.prompt}</h1>
          <div class="choices">${choices}</div>
          ${state.showLocked ? `<p class="feedback" role="status">${state.showRight ? question.yes : question.no}</p><button type="button" class="primary" data-action="tv-next">${nextLabel}</button>` : ''}
        </div>
      </div>
      <button type="button" class="texty" data-action="tv-close">Leave the TV</button>
    </main>`,
  )
}

function renderTvResult(state) {
  return shell(
    state,
    `<main class="show">
      <div class="bezel">
        <div class="bezel-screen">
          <p class="show-title">Heat Check</p>
          <p class="show-sub">A silly hot-chicken guessing show</p>
          <h1>Score ${state.showScore} / ${SHOW.length}</h1>
          <p class="feedback">Pip waves from inside the television. The house is still the real game.</p>
          <button type="button" class="primary" data-action="tv-close">Back to the dollhouse</button>
        </div>
      </div>
    </main>`,
  )
}

function renderTennis(state) {
  return shell(
    state,
    `<main class="rally">
      <p class="eyebrow">Looking down on the court</p>
      <h1>Rally Nell</h1>
      <p class="lede">Nell from the Shelby Park path has a racket. You have a racket. Return the ball 3 times.</p>
      <canvas id="court" width="360" height="280"></canvas>
      <p id="rally-status" role="status">Returns 0 / 3</p>
      <div class="nudge">
        <button type="button" id="nudge-left">Racket left</button>
        <button type="button" id="nudge-right">Racket right</button>
      </div>
      <button type="button" class="primary" id="rally-done" data-action="tennis-won" hidden>Back to the house</button>
      <button type="button" class="texty" id="rally-leave" data-action="tennis-back">Leave the court</button>
    </main>`,
  )
}

function renderKnock(state) {
  return shell(
    state,
    `<main class="knock-scene">
      <p class="knocks" aria-label="Three knocks"><span>Knock</span><span>Knock</span><span>Knock</span></p>
      <div class="person clive" aria-hidden="true">
        <span class="head"></span>
        <span class="specs"></span>
        <span class="torso"></span>
        <span class="clipboard"></span>
      </div>
      <h1>Clive wants the house</h1>
      <p class="lede">He collects houses the way other people collect bottle caps. He knocks. He does not push. Copy three silly poses and he will agree this one is yours.</p>
      <button type="button" class="primary" data-action="start-poses">Copy the poses</button>
    </main>`,
  )
}

function renderPose(state) {
  const wanted = poseById(state.poseOrder[state.poseIndex])
  const options = state.poseOptions
    .map((id) => {
      const pose = poseById(id)
      return `<button type="button" class="pose-choice" data-action="pose" data-pose="${pose.id}">
        ${poseSvg(pose.id)}
        <span>${pose.name}</span>
      </button>`
    })
    .join('')
  return shell(
    state,
    `<main class="poses">
      <p class="eyebrow">Pose ${state.poseIndex + 1} of 3</p>
      ${state.poseNote ? `<p class="feedback" role="status">${state.poseNote}</p>` : ''}
      <div class="pose-demo">${poseSvg(wanted.id)}</div>
      <h1>${wanted.name}</h1>
      <p class="lede">${wanted.detail}</p>
      <div class="pose-list">${options}</div>
    </main>`,
  )
}

function renderWhimper(state) {
  const wanted = poseById(state.wantedPose)
  const missed = poseById(state.missedPose)
  const ghost = state.lostName
    ? `<article class="dollhouse ghost kind-${state.lostStyle || 'brick'}" aria-label="Borrowed house">
        <header class="roof"><h2>${state.lostName}</h2><p>Borrowed</p></header>
        <p class="ghost-note">Clive is watering the one plant.</p>
      </article>`
    : ''
  const street = `<div class="whimper-spot">
    <div class="person you" aria-hidden="true"><span class="head"></span><span class="torso"></span></div>
    <p class="whimper-word">whimper… whimper…</p>
  </div>`
  return shell(
    state,
    `<main class="whimper">
      <h1>You whimper on the street</h1>
      <p class="lede">That was ${missed ? missed.name : 'a different pose'}. Clive asked for ${wanted ? wanted.name : 'the other pose'}. The sidewalk is dramatic, and you are fine.</p>
      ${pocketMap(ghost || '<p class="empty-lot">The lot is open again.</p>', street)}
      <div class="dock">
        <button type="button" class="primary" data-action="rebuild">Build the house again</button>
      </div>
    </main>`,
  )
}

function renderWin(state) {
  const house = activeHouse(state)
  const room = ROOM_LABELS[state.lastRoom] || 'a room'
  const neighborhood = isNeighborhood(state)
  const next = neighborhood
    ? `<button type="button" class="primary" data-action="see-neighborhood">See the neighborhood</button>`
    : `<button type="button" class="primary" data-action="build-another">Build another house</button>`
  return shell(
    state,
    `<main class="win">
      <p class="sticker">Room added</p>
      <h1>${room}</h1>
      <p class="lede">${house.name} grows a ${room.toLowerCase()}. Clive applauds with both hands and a clipboard, then walks toward Five Points.</p>
      <p class="status">${neighborhood ? 'It became a neighborhood.' : `${state.kept.length} of 3 houses. Keep making houses until it becomes a neighborhood.`}</p>
      ${dollhouse(house, { playable: false, newRoom: state.lastRoom })}
      <div class="dock stack">
        ${next}
        <button type="button" class="texty" data-action="see-house">Look down at the house</button>
      </div>
    </main>`,
  )
}

function renderNeighborhood(state) {
  const footprints = state.kept
    .map(
      (house) => `<article class="footprint kind-${house.style}">
        <h2>${house.name}</h2>
        <p>Lot ${house.lot}</p>
        <p>${house.rooms.length} rooms</p>
      </article>`,
    )
    .join('')
  return shell(
    state,
    `<main class="neighborhood">
      <h1>A neighborhood</h1>
      <p class="lede">Three houses, one block. Five Points to Shelby Park, with bikes on the sidewalk and the toy store still open.</p>
      ${pocketMap(`<div class="footprints">${footprints}</div>`)}
      <div class="dock stack">
        <button type="button" class="primary" data-action="see-house">Look down at the newest house</button>
        <button type="button" class="texty" data-action="new-block">Build a new block</button>
      </div>
    </main>`,
  )
}

export function render(state) {
  switch (state.screen) {
    case 'pick':
      return renderPick(state)
    case 'house':
      return renderHouse(state)
    case 'tv':
      return renderTv(state)
    case 'tv-result':
      return renderTvResult(state)
    case 'tennis':
      return renderTennis(state)
    case 'knock':
      return renderKnock(state)
    case 'pose':
      return renderPose(state)
    case 'whimper':
      return renderWhimper(state)
    case 'win':
      return renderWin(state)
    case 'neighborhood':
      return renderNeighborhood(state)
    default:
      return renderPick(state)
  }
}
