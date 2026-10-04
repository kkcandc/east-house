import { RALLY_GOAL, createRally, stepRally } from './rally.js'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function mountTennis({ canvas, status, done, leave, left, right }) {
  const ctx = canvas.getContext('2d')
  let rally = createRally()
  let target = rally.playerX
  let view = { w: 360, h: 280 }
  let raf = 0
  let last = performance.now()
  let sent = false
  let dragging = false

  function fit() {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(240, rect.width)
    const h = Math.max(220, rect.height)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    view = { w, h }
  }

  function setFromEvent(event) {
    const rect = canvas.getBoundingClientRect()
    target = clamp((event.clientX - rect.left) / rect.width, 0.08, 0.92)
  }

  function onDown(event) {
    dragging = true
    canvas.setPointerCapture?.(event.pointerId)
    setFromEvent(event)
  }
  function onMove(event) {
    if (!dragging) return
    setFromEvent(event)
  }
  function onUp() {
    dragging = false
  }
  function nudge(dir) {
    target = clamp(target + dir * 0.16, 0.08, 0.92)
  }
  function onLeft(event) {
    event.stopPropagation()
    nudge(-1)
  }
  function onRight(event) {
    event.stopPropagation()
    nudge(1)
  }
  function onKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    nudge(event.key === 'ArrowLeft' ? -1 : 1)
  }

  function drawPerson(x, y, color) {
    ctx.fillStyle = color
    ctx.strokeStyle = '#241c16'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  function drawRacket(x, y, color) {
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = color
    ctx.strokeStyle = '#241c16'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-16, 0)
    ctx.lineTo(16, 0)
    ctx.moveTo(0, -8)
    ctx.lineTo(0, 8)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(0, 32)
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  }

  function draw() {
    const { w, h } = view
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#2f7a45'
    ctx.strokeStyle = '#241c16'
    ctx.lineWidth = 3
    roundRect(ctx, 8, 8, w - 16, h - 16, 16)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,248,234,0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(22, 22, w - 44, h - 44)
    ctx.beginPath()
    ctx.moveTo(22, h / 2)
    ctx.lineTo(w - 22, h / 2)
    ctx.stroke()

    ctx.fillStyle = '#f6ead6'
    ctx.font = '12px Georgia, serif'
    ctx.fillText('Nell', 16, 28)

    drawPerson(rally.oppX * w, h * 0.1, '#3aa7a3')
    drawRacket(rally.oppX * w, h * 0.18, '#d7fff8')
    drawRacket(rally.playerX * w, h * 0.78, '#f2c14e')
    drawPerson(rally.playerX * w, h * 0.93, '#e39b3a')

    ctx.fillStyle = '#241c16'
    ctx.font = '12px Georgia, serif'
    ctx.fillText('You', w - 42, h - 14)

    ctx.fillStyle = 'rgba(36,28,22,0.18)'
    ctx.beginPath()
    ctx.ellipse(rally.ballX * w + 3, rally.ballY * h + 8, 8, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f6e27a'
    ctx.strokeStyle = '#241c16'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(rally.ballX * w, rally.ballY * h, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  function frame(now) {
    const dt = Math.min(34, now - last)
    last = now
    rally = stepRally(rally, dt, target)
    draw()
    if (status) {
      const base = `Returns ${rally.hits} / ${RALLY_GOAL}`
      const extra = rally.banner === 'miss' ? ' The ball skipped past your racket.' : rally.banner === 'return' ? ' Nice return.' : ''
      status.textContent = `${base}${rally.misses ? ` · missed ${rally.misses}` : ''}${extra}`
    }
    if (rally.phase === 'won' && !sent) {
      sent = true
      if (done) done.hidden = false
      if (leave) leave.hidden = true
      if (status) status.textContent = 'Rally complete. Nell taps her racket on the court.'
    }
    raf = requestAnimationFrame(frame)
  }

  fit()
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  left?.addEventListener('click', onLeft)
  right?.addEventListener('click', onRight)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', fit)
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    left?.removeEventListener('click', onLeft)
    right?.removeEventListener('click', onRight)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', fit)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
