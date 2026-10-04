export function bikeSvg(color) {
  return `<svg class="bike" viewBox="0 0 72 40" aria-hidden="true">
    <g fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="26" r="9" fill="#f6ead6"/>
      <circle cx="56" cy="26" r="9" fill="#f6ead6"/>
      <path d="M14 26 H32 L40 14 H48 L56 26"/>
      <path d="M32 26 H48"/>
      <path d="M40 14 L34 14"/>
    </g>
  </svg>`
}

export function fivePointsSvg() {
  return `<svg class="points-svg" viewBox="0 0 120 88" aria-hidden="true">
    <g stroke="#5e584f" stroke-width="10" stroke-linecap="round">
      <path d="M60 44 V8"/>
      <path d="M60 44 L104 22"/>
      <path d="M60 44 L108 62"/>
      <path d="M60 44 L18 70"/>
      <path d="M60 44 L12 24"/>
    </g>
    <circle cx="60" cy="44" r="12" fill="#f2c14e" stroke="#241c16" stroke-width="2"/>
    <text x="60" y="48" text-anchor="middle" font-size="12" font-family="Georgia, serif" fill="#241c16">5</text>
  </svg>`
}

const SHIRTS = {
  flamingo: '#ee6d8a',
  pizza: '#f2c14e',
  bicycle: '#3aa7a3',
}

export function poseSvg(id) {
  const shirt = SHIRTS[id] || '#f2c14e'
  const limbs = {
    flamingo: `
      <path d="M60 86 L46 126" />
      <path d="M60 86 L84 104" />
      <path d="M60 62 L16 62" />
      <path d="M60 62 L82 78" />
    `,
    pizza: `
      <path d="M60 86 L40 126" />
      <path d="M60 86 L80 126" />
      <path d="M60 60 L28 22" />
      <path d="M60 60 L92 22" />
    `,
    bicycle: `
      <path d="M60 86 L46 126" />
      <path d="M60 86 L74 126" />
      <path d="M58 66 L24 78" />
      <path d="M62 66 L96 78" />
      <circle cx="24" cy="78" r="8" fill="#fff8ea"/>
      <circle cx="96" cy="78" r="8" fill="#fff8ea"/>
    `,
  }[id] || ''

  const face =
    id === 'bicycle'
      ? `<path d="M50 34 q5 4 10 0" /><path d="M68 34 q5 4 10 0" />`
      : `<circle cx="52" cy="34" r="2.2" fill="#241c16" stroke="none"/><circle cx="70" cy="34" r="2.2" fill="#241c16" stroke="none"/>`

  const zzz = id === 'bicycle' ? `<text x="92" y="28" font-size="12" fill="#241c16">z</text>` : ''

  return `<svg class="pose-art" viewBox="0 0 120 140" aria-hidden="true">
    <g fill="none" stroke="#241c16" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      ${limbs}
    </g>
    <circle cx="60" cy="34" r="16" fill="#f3c7a1" stroke="#241c16" stroke-width="3"/>
    ${face}
    <path d="M54 42 q6 6 12 0" fill="none" stroke="#241c16" stroke-width="2" stroke-linecap="round"/>
    <rect x="46" y="52" width="28" height="32" rx="10" fill="${shirt}" stroke="#241c16" stroke-width="3"/>
    ${zzz}
  </svg>`
}
