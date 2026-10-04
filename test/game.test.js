import assert from 'node:assert/strict'
import test from 'node:test'
import { SHOW, createState, isNeighborhood, reduce } from '../src/logic.js'
import { createRally, stepRally } from '../src/rally.js'
import { render } from '../src/render.js'

const rng = () => 0

function finishShow(state) {
  let next = reduce(state, 'open-tv')
  while (next.screen === 'tv') {
    const question = SHOW[next.showIndex]
    next = reduce(next, 'tv-answer', { choice: question.answer })
    next = reduce(next, 'tv-next')
  }
  assert.equal(next.screen, 'tv-result')
  return reduce(next, 'tv-close')
}

function winHouse(state, style) {
  let next = reduce(state, 'choose-house', { house: style }, rng)
  next = finishShow(next)
  assert.equal(next.tvDone, true)
  next = reduce(next, 'open-tennis')
  next = reduce(next, 'tennis-won')
  assert.equal(next.tennisDone, true)
  const quiet = reduce({ ...next, tvDone: false }, 'open-knock')
  assert.equal(quiet.screen, 'house')
  next = reduce(next, 'open-knock')
  next = reduce(next, 'start-poses', {}, rng)
  while (next.screen === 'pose') {
    next = reduce(next, 'pose', { pose: next.poseOrder[next.poseIndex] }, rng)
  }
  return next
}

test('a player picks a house and cannot face Clive early', () => {
  const picked = reduce(createState(), 'choose-house', { house: 'shotgun' })
  assert.equal(picked.screen, 'house')
  assert.equal(picked.draft.name, 'Shelby Shotgun')
  assert.equal(reduce(picked, 'open-knock').screen, 'house')
  const html = render(picked)
  assert.match(html, /Five Points corner/)
  assert.match(html, /Shelby Park/)
  assert.match(html, /Tabla Rasa Toy Store/)
  assert.match(html, /Mural wall/)
  assert.match(html, /Bikes on the sidewalk/)
  assert.match(html, /data-action="open-tv"/)
  assert.match(html, /data-action="open-tennis"/)
  assert.doesNotMatch(html, /data-action="open-knock"/)
  assert.doesNotMatch(html, /bungalow|porch/i)
})

test('the hot-chicken show lives on the television', () => {
  let state = reduce(createState(), 'choose-house', { house: 'brick' })
  state = reduce(state, 'open-tv')
  const html = render(state)
  assert.match(html, /silly hot-chicken guessing show/)
  assert.match(html, /Heat Check/)
  assert.match(html, /On the television/)
  assert.doesNotMatch(html, /hot-chicken window|service window/i)
  state = reduce(state, 'tv-answer', { choice: 'polite' })
  assert.equal(state.showRight, false)
  state = reduce(state, 'tv-next')
  state = reduce(state, 'tv-answer', { choice: SHOW[state.showIndex].answer })
  state = reduce(state, 'tv-next')
  state = reduce(state, 'tv-answer', { choice: SHOW[state.showIndex].answer })
  state = reduce(state, 'tv-next')
  state = reduce(state, 'tv-close')
  assert.equal(state.tvDone, true)
  assert.equal(state.showScore, 2)
})

test('a missed pose sends the player to whimper and rebuild', () => {
  let state = reduce(createState(), 'choose-house', { house: 'brick' })
  state = finishShow(state)
  state = reduce(state, 'open-tennis')
  state = reduce(state, 'tennis-won')
  state = reduce(state, 'open-knock')
  state = reduce(state, 'start-poses', {}, rng)
  const wrong = state.poseOptions.find((id) => id !== state.poseOrder[state.poseIndex])
  state = reduce(state, 'pose', { pose: wrong }, rng)
  assert.equal(state.screen, 'whimper')
  const html = render(state)
  assert.match(html, /You whimper on the street/)
  assert.match(html, /whimper… whimper…/)
  assert.match(html, /Build the house again/)
  assert.match(html, /Five Points corner/)
  assert.match(html, /Tabla Rasa Toy Store/)
  state = reduce(state, 'rebuild')
  assert.equal(state.screen, 'pick')
  assert.equal(state.kept.length, 0)
  assert.equal(state.draft, null)
})

test('three kept houses become a neighborhood with a new room each time', () => {
  let state = createState()
  state = winHouse(state, 'brick')
  assert.equal(state.screen, 'win')
  assert.equal(state.lastRoom, 'sunroom')
  assert.equal(state.kept[0].rooms.at(-1), 'sunroom')
  assert.match(render(state), /Room added/)
  assert.match(render(state), /neighborhood/)
  state = reduce(state, 'build-another')
  state = winHouse(state, 'shotgun')
  state = reduce(state, 'build-another')
  state = winHouse(state, 'skinny')
  assert.equal(isNeighborhood(state), true)
  state = reduce(state, 'see-neighborhood')
  assert.equal(state.screen, 'neighborhood')
  const html = render(state)
  assert.match(html, /A neighborhood/)
  assert.match(html, /Porter Brick/)
  assert.match(html, /Shelby Shotgun/)
  assert.match(html, /Gallatin Skinny/)
  assert.match(html, /Shelby Park/)
  assert.match(html, /Mural wall/)
  assert.doesNotMatch(html, /bungalow|porch/i)
})

test('an earlier house stays if the next one is lost', () => {
  let state = winHouse(createState(), 'skinny')
  state = reduce(state, 'build-another')
  state = reduce(state, 'choose-house', { house: 'brick' })
  state = finishShow(state)
  state = reduce(state, 'open-tennis')
  state = reduce(state, 'tennis-won')
  state = reduce(state, 'open-knock')
  state = reduce(state, 'start-poses', {}, rng)
  const wrong = state.poseOptions.find((id) => id !== state.poseOrder[state.poseIndex])
  state = reduce(state, 'pose', { pose: wrong }, rng)
  assert.equal(state.kept.length, 1)
  assert.equal(state.kept[0].name, 'Gallatin Skinny')
  state = reduce(state, 'rebuild')
  assert.match(render(state), /Gallatin Skinny already on the block/)
})

test('the opening serve misses a racket left in the center', () => {
  let rally = createRally()
  for (let i = 0; i < 500 && rally.hits === 0 && rally.misses === 0; i += 1) {
    rally = stepRally(rally, 16, 0.5)
  }
  assert.equal(rally.hits, 0)
  assert.ok(rally.misses > 0)
})

test('a following racket finishes the rally and a parked racket can miss', () => {
  let rally = createRally()
  for (let i = 0; i < 20000 && rally.phase !== 'won'; i += 1) {
    rally = stepRally(rally, 16, rally.ballX)
  }
  assert.equal(rally.phase, 'won')
  assert.equal(rally.hits, 3)

  rally = { ...createRally(), ballX: 0.18, ballVX: 0, ballVY: 0.001, touch: 'opp' }
  let missed = false
  for (let i = 0; i < 400; i += 1) {
    rally = stepRally(rally, 16, 0.86)
    if (rally.misses > 0) missed = true
  }
  assert.equal(missed, true)
})
