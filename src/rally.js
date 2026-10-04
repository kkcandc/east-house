export const RALLY_GOAL = 3

const SPEED = 0.00068
const RACKET_REACH = 0.11

export function createRally() {
  const aim = 0.26
  const ballX = 0.58
  const ballY = 0.22
  const travel = (0.82 - ballY) / SPEED
  return {
    ballX,
    ballY,
    ballVX: (aim - ballX) / travel,
    ballVY: SPEED,
    playerX: 0.5,
    oppX: 0.5,
    hits: 0,
    misses: 0,
    touch: 'opp',
    phase: 'play',
    aim,
    banner: '',
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function stepRally(rally, dt, targetX) {
  if (rally.phase !== 'play') return rally
  const step = Math.max(0, Math.min(dt, 40))
  const next = { ...rally, banner: '' }
  next.playerX = clamp(targetX, 0.08, 0.92)
  next.oppX = rally.oppX + (rally.ballX - rally.oppX) * Math.min(1, step / 160)
  next.ballX = clamp(rally.ballX + rally.ballVX * step, 0.06, 0.94)
  next.ballY = rally.ballY + rally.ballVY * step

  if (next.ballX <= 0.06) next.ballVX = Math.abs(next.ballVX)
  if (next.ballX >= 0.94) next.ballVX = -Math.abs(next.ballVX)

  if (next.ballVY < 0 && next.ballY <= 0.14) {
    const speed = SPEED + next.hits * 0.000045
    const aims = [0.24, 0.76, 0.5]
    const aim = aims[next.hits % aims.length]
    const travel = (0.82 - 0.14) / speed
    next.ballY = 0.14
    next.ballVY = speed
    next.ballVX = (aim - next.ballX) / travel
    next.aim = aim
    next.touch = 'opp'
  }

  if (next.touch !== 'player' && next.ballVY > 0 && next.ballY >= 0.78 && next.ballY <= 0.98) {
    if (Math.abs(next.ballX - next.playerX) <= RACKET_REACH) {
      const speed = SPEED + next.hits * 0.000045
      next.hits += 1
      next.ballY = 0.78
      next.ballVY = -speed
      next.ballVX += (next.ballX - next.playerX) * 0.0008
      next.ballVX = clamp(next.ballVX, -0.0005, 0.0005)
      next.touch = 'player'
      next.banner = 'return'
      if (next.hits >= RALLY_GOAL) next.phase = 'won'
    }
  }

  if (next.phase === 'play' && next.ballY > 1.05) {
    const speed = SPEED
    const aim = next.misses % 2 === 0 ? 0.22 : 0.78
    const ballX = aim > 0.5 ? 0.35 : 0.65
    const ballY = 0.2
    const travel = (0.82 - ballY) / speed
    next.misses += 1
    next.ballX = ballX
    next.ballY = ballY
    next.ballVX = (aim - ballX) / travel
    next.ballVY = speed
    next.touch = 'opp'
    next.aim = aim
    next.banner = 'miss'
  }

  return next
}
