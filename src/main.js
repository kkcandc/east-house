import './style.css'
import { createState, reduce } from './logic.js'
import { render } from './render.js'
import { mountTennis } from './tennis.js'

const app = document.querySelector('#app')
let state = createState()
let stopTennis = () => {}
let audio

function tone(freq, duration, type = 'sine') {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return
  if (!audio) audio = new AudioCtx()
  if (audio.state === 'suspended') audio.resume()
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = 0.03
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start()
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
  osc.stop(audio.currentTime + duration)
}

function soundsFor(action, next) {
  if (action === 'open-knock') {
    tone(180, 0.12, 'triangle')
    setTimeout(() => tone(160, 0.12, 'triangle'), 180)
    setTimeout(() => tone(140, 0.14, 'triangle'), 360)
  } else if (action === 'tv-answer') {
    tone(next.showRight ? 520 : 180, 0.08, 'square')
  } else if (action === 'pose' && next.screen === 'win') {
    tone(440, 0.08)
    setTimeout(() => tone(554, 0.08), 90)
    setTimeout(() => tone(659, 0.12), 180)
  } else if (action === 'pose' && next.screen === 'whimper') {
    tone(300, 0.12)
    setTimeout(() => tone(220, 0.16), 140)
  } else if (action === 'tennis-won') {
    tone(494, 0.1)
  }
}

function draw() {
  stopTennis()
  stopTennis = () => {}
  app.innerHTML = render(state)
  document.body.dataset.screen = state.screen
  if (state.screen === 'tennis') {
    stopTennis = mountTennis({
      canvas: document.querySelector('#court'),
      status: document.querySelector('#rally-status'),
      done: document.querySelector('#rally-done'),
      leave: document.querySelector('#rally-leave'),
      left: document.querySelector('#nudge-left'),
      right: document.querySelector('#nudge-right'),
    })
  }
}

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]')
  if (!el || !app.contains(el)) return
  const next = reduce(state, el.dataset.action, el.dataset)
  if (next === state) return
  soundsFor(el.dataset.action, next)
  state = next
  draw()
})

draw()
