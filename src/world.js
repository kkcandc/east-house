import * as THREE from 'three'
import { ROOMS, activeHouse } from './logic.js'

const EYE = 1.62

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.22
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#c5dff0')

  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 50)
  camera.rotation.order = 'YXZ'

  const hemi = new THREE.HemisphereLight('#fff4e4', '#8ea0b0', 1.15)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff7ea', 1.7)
  sun.position.set(5, 10, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 28
  sun.shadow.camera.left = -10
  sun.shadow.camera.right = 10
  sun.shadow.camera.top = 10
  sun.shadow.camera.bottom = -10
  scene.add(sun)

  const roomGroup = new THREE.Group()
  const streetGroup = new THREE.Group()
  scene.add(roomGroup, streetGroup)

  const gloveMat = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.45 })
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#241c16', roughness: 0.55 })
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), gloveMat)
  glove.castShadow = true
  glove.visible = false
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.3), shoeMat)
  shoe.castShadow = true
  shoe.visible = false
  camera.add(glove, shoe)
  scene.add(camera)

  const wood = woodTexture()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  const state3 = {
    mode: 'street',
    px: 0,
    pz: 4,
    yaw: 0,
    pitch: -0.12,
    bounds: null,
    floor: null,
    nico: null,
    arms: null,
    furniture: null,
    ghost: null,
    ghostKind: null,
    mood: 'idle',
    strike: null,
    hitT: 0,
    time: 0,
    roomId: '',
  }

  function resize() {
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  function forward() {
    return { x: -Math.sin(state3.yaw), z: -Math.cos(state3.yaw) }
  }

  function applyCamera() {
    const eye = state3.mode === 'street' ? 2.35 : EYE
    camera.position.set(state3.px, eye, state3.pz)
    camera.rotation.y = state3.yaw
    camera.rotation.x = state3.pitch
    camera.rotation.z = 0
  }

  function tryMove(dx, dz) {
    if (!state3.bounds) return
    const { minX, maxX, minZ, maxZ } = state3.bounds
    const radius = 0.28
    state3.px = clamp(state3.px + dx, minX + radius, maxX - radius)
    state3.pz = clamp(state3.pz + dz, minZ + radius, maxZ - radius)
  }

  function clear(group) {
    const disposed = new Set()
    while (group.children.length) {
      const child = group.children.pop()
      child.traverse?.((obj) => {
        if (obj.geometry && !disposed.has(obj.geometry)) {
          disposed.add(obj.geometry)
          obj.geometry.dispose()
        }
        const materials = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []
        for (const material of materials) {
          if (disposed.has(material)) continue
          disposed.add(material)
          if (material.map && material.map !== wood) material.map.dispose()
          material.dispose()
        }
      })
    }
  }

  function buildRoom(house) {
    clear(roomGroup)
    const spec = ROOMS[house.style]
    const { w, d, h } = spec
    state3.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 }
    const wall = mat(spec.wall, { roughness: 0.92 })
    const trim = mat(spec.trim, { roughness: 0.55 })
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat('#c8956a', { map: wood, roughness: 0.78 }))
    floor.position.y = -0.06
    floor.receiveShadow = true
    floor.name = 'floor'
    roomGroup.add(floor)
    state3.floor = floor

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.08, d),
      mat('#f7f3ea', { roughness: 1 }),
    )
    ceiling.position.y = h
    roomGroup.add(ceiling)

    const thick = 0.14
    slab(roomGroup, thick, h, d, wall, -w / 2, h / 2, 0)
    slab(roomGroup, thick, h, d, wall, w / 2, h / 2, 0)
    addDoorWall(roomGroup, w, d, h, wall, trim)
    addWindowWall(roomGroup, w, d, h, wall, trim)

    const tree = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8), mat('#6b4630'))
    trunk.position.y = 0.4
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat('#2f7a45', { roughness: 0.9 }))
    crown.position.y = 1.05
    tree.add(trunk, crown)
    tree.position.set(0.4, 0, -d / 2 - 1.3)
    roomGroup.add(tree)

    const bulb = new THREE.PointLight('#ffe0b8', 1.6, 12)
    bulb.position.set(0, h - 0.3, 0)
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 12), mat('#f2c14e'))
    fixture.position.copy(bulb.position)
    roomGroup.add(bulb, fixture)

    state3.nico = makeNico()
    state3.nico.position.set(0, 0, -d / 2 + 0.9)
    state3.nico.visible = false
    state3.arms = state3.nico.userData.arms
    roomGroup.add(state3.nico)

    state3.furniture = new THREE.Group()
    state3.ghost = new THREE.Group()
    roomGroup.add(state3.furniture, state3.ghost)
    state3.roomId = house.uid
  }

  function showInterior(house, reset) {
    state3.mode = 'interior'
    streetGroup.visible = false
    roomGroup.visible = true
    if (!house) return
    if (state3.roomId !== house.uid || reset) {
      buildRoom(house)
      if (reset) {
        const spec = ROOMS[house.style]
        state3.px = 0
        state3.pz = spec.d / 2 - 0.85
        state3.yaw = 0
        state3.pitch = -0.06
      }
    }
    syncFurniture(house.furniture || [])
  }

  function showStreet(game, reset) {
    state3.mode = 'street'
    roomGroup.visible = false
    streetGroup.visible = true
    state3.floor = null
    buildStreet(game)
    state3.bounds = { minX: -0.55, maxX: 1.35, minZ: -8.5, maxZ: 8.4 }
    if (reset) {
      state3.px = 0.45
      state3.pz = 8.35
      state3.yaw = 0.06
      state3.pitch = -0.34
    }
  }

  function syncFurniture(items) {
    if (!state3.furniture) return
    const need = new Set(items.map((item) => item.id))
    for (const child of [...state3.furniture.children]) {
      if (!need.has(child.userData.id)) state3.furniture.remove(child)
    }
    for (const item of items) {
      if (state3.furniture.children.some((child) => child.userData.id === item.id)) continue
      const mesh = makeFurniture(item.kind, true)
      mesh.userData.id = item.id
      mesh.position.set(item.x, 0, item.z)
      mesh.rotation.y = item.rot + faceOffset(item.kind)
      state3.furniture.add(mesh)
    }
  }

  function placePoint() {
    const dir = forward()
    return {
      x: state3.px + dir.x * 1.35,
      z: state3.pz + dir.z * 1.35,
      rot: state3.yaw,
    }
  }

  function rayPlace(clientX, clientY) {
    if (!state3.floor) return null
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObject(state3.floor, false)
    if (!hits.length) return null
    return { x: hits[0].point.x, z: hits[0].point.z, rot: state3.yaw }
  }

  function nudge(dir) {
    const dirVec = forward()
    if (dir === 'forward') tryMove(dirVec.x * 0.7, dirVec.z * 0.7)
    if (dir === 'back') tryMove(-dirVec.x * 0.45, -dirVec.z * 0.45)
    if (dir === 'left') state3.yaw += 0.62
    if (dir === 'right') state3.yaw -= 0.62
    applyCamera()
  }

  function faceNico() {
    if (!state3.nico || !state3.bounds) return
    const dir = forward()
    const { minX, maxX, minZ, maxZ } = state3.bounds
    const x = clamp(state3.px + dir.x * 2.2, minX + 0.45, maxX - 0.45)
    const z = clamp(state3.pz + dir.z * 2.2, minZ + 0.45, maxZ - 0.45)
    state3.nico.position.set(x, 0, z)
    const dx = x - state3.px
    const dz = z - state3.pz
    state3.yaw = Math.atan2(-dx, -dz)
    state3.pitch = -0.04
    applyCamera()
  }

  function update(dt, input) {
    state3.time += dt
    if (state3.mode === 'pick') {
      const angle = state3.time * 0.18
      camera.position.set(Math.sin(angle) * 1.4 + 1.2, 2.5, 5.2)
      camera.lookAt(0.6, 1.1, -1)
      renderer.render(scene, camera)
      return
    }

    if (state3.mode !== 'fight-frozen') {
      state3.yaw -= input.lookX || 0
      state3.pitch = clamp(state3.pitch - (input.lookY || 0), -0.9, 0.7)
      input.lookX = 0
      input.lookY = 0
      const dirVec = forward()
      const rx = -dirVec.z
      const rz = dirVec.x
      const speed = 1.8 * dt
      const forwardAmt = input.forward || 0
      const strafe = input.strafe || 0
      if (state3.mode === 'interior' || state3.mode === 'street') {
        tryMove(dirVec.x * forwardAmt * speed + rx * strafe * speed, dirVec.z * forwardAmt * speed + rz * strafe * speed)
      }
    }
    applyCamera()

    if (state3.ghost) {
      const kind = state3.ghostKind
      if (kind && state3.mode === 'interior') {
        if (state3.ghost.userData.kind !== kind) {
          clear(state3.ghost)
          const mesh = makeFurniture(kind, false)
          mesh.traverse((obj) => {
            if (!obj.isMesh) return
            obj.material = obj.material.clone()
            obj.material.transparent = true
            obj.material.opacity = 0.38
            obj.castShadow = false
          })
          mesh.userData.kind = kind
          state3.ghost.add(mesh)
          state3.ghost.userData.kind = kind
        }
        const spot = placePoint()
        state3.ghost.position.set(spot.x, 0, spot.z)
        state3.ghost.rotation.y = spot.rot + faceOffset(kind)
        state3.ghost.visible = true
      } else {
        state3.ghost.visible = false
      }
    }

    if (state3.nico) {
      state3.nico.position.y = Math.sin(state3.time * 2.4) * 0.02
      const up = state3.mood === 'windup' || state3.mood === 'open'
      if (state3.arms) {
        state3.arms.left.rotation.z = up ? 2.1 : 0.25
        state3.arms.right.rotation.z = up ? -2.1 : -0.25
      }
      if (state3.hitT > 0) {
        state3.hitT -= dt
        state3.nico.rotation.z = Math.sin(state3.hitT * 28) * 0.35
      } else {
        state3.nico.rotation.z = 0
      }
    }

    if (state3.strike) {
      state3.strike.t += dt
      const wave = Math.sin(Math.min(1, state3.strike.t / 0.26) * Math.PI)
      glove.visible = state3.strike.kind === 'punch'
      shoe.visible = state3.strike.kind === 'kick'
      if (state3.strike.kind === 'punch') glove.position.set(0.2, -0.18, -0.42 - wave * 0.75)
      if (state3.strike.kind === 'kick') shoe.position.set(0.08, -0.42 + wave * 0.2, -0.4 - wave * 0.9)
      if (state3.strike.t > 0.42) {
        glove.visible = false
        shoe.visible = false
        state3.strike = null
      }
    }

    renderer.render(scene, camera)
  }

  function buildStreet(game) {
    clear(streetGroup)
    const ground = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 28), mat('#6a645c', { roughness: 1 }))
    ground.position.set(0, -0.12, -2)
    ground.receiveShadow = true
    streetGroup.add(ground)

    const grass = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 24), mat('#6e8f55', { roughness: 1 }))
    grass.position.set(-3.1, 0.02, -1)
    grass.receiveShadow = true
    streetGroup.add(grass)

    const walk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 24), mat('#e4d5c0', { roughness: 0.95 }))
    walk.position.set(-0.15, 0.04, -1)
    walk.receiveShadow = true
    streetGroup.add(walk)

    const road = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 24), mat('#3c3834', { roughness: 0.9 }))
    road.position.set(2.15, 0.03, -1)
    road.receiveShadow = true
    streetGroup.add(road)

    for (let i = 0; i < 10; i += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.7), mat('#f6f1e8'))
      dash.position.set(2.15, 0.06, 6.2 - i * 1.7)
      streetGroup.add(dash)
    }

    const fill = new THREE.DirectionalLight('#fff8ee', 1.25)
    fill.position.set(1.5, 7, 12)
    streetGroup.add(fill)

    game.kept.forEach((house, index) => {
      streetGroup.add(exteriorHouse(house, index))
    })

    for (const piece of game.street) {
      const prop = streetProp(piece.kind)
      const onSidewalk = piece.lane === 'sidewalk'
      prop.position.set(onSidewalk ? 1.15 : 2.15, 0, 3.35 - piece.slot * 1.55)
      prop.scale.setScalar(1.65)
      streetGroup.add(prop)
    }

    const skyTree = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), mat('#2f7a45'))
    skyTree.position.set(-2.4, 1.2, 4.2)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), mat('#6b4630'))
    trunk.position.set(-2.4, 0.45, 4.2)
    streetGroup.add(trunk, skyTree)
  }

  resize()
  showStreet({ kept: [], street: [], screen: 'pick', draft: null }, true)
  state3.mode = 'pick'

  return {
    resize,
    update,
    nudge,
    faceNico,
    placePoint,
    rayPlace,
    sync(game, { reset = false } = {}) {
      const interior = game.screen === 'decorate' || game.screen === 'fight' || game.screen === 'kept'
      if (interior) {
        const house = activeHouse(game)
        showInterior(house, reset || state3.mode !== 'interior')
        state3.mode = 'interior'
        camera.fov = 68
        camera.updateProjectionMatrix()
        if (state3.nico) state3.nico.visible = game.screen === 'fight'
      } else if (game.screen === 'pick') {
        if (state3.mode !== 'pick') {
          showStreet(game, true)
          state3.mode = 'pick'
        }
      } else {
        showStreet(game, reset || state3.mode === 'interior' || state3.mode === 'pick')
        state3.mode = 'street'
        camera.fov = 74
        camera.updateProjectionMatrix()
      }
    },
    set ghostKind(value) {
      state3.ghostKind = value
    },
    set mood(value) {
      state3.mood = value
    },
    playStrike(kind) {
      state3.strike = { kind, t: 0 }
      state3.hitT = 0.45
    },
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra })
}

function slab(group, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function addDoorWall(group, w, d, h, wall, trim) {
  const t = 0.14
  const doorW = 0.96
  const doorH = 2.08
  const side = (w - doorW) / 2
  slab(group, side, h, t, wall, -w / 2 + side / 2, h / 2, d / 2)
  slab(group, side, h, t, wall, w / 2 - side / 2, h / 2, d / 2)
  slab(group, doorW, h - doorH, t, wall, 0, doorH + (h - doorH) / 2, d / 2)
  slab(group, doorW + 0.12, 0.08, 0.08, trim, 0, doorH, d / 2 - 0.02)
}

function addWindowWall(group, w, d, h, wall, trim) {
  const t = 0.14
  const winW = Math.min(1.7, w - 1.1)
  const winH = 1.15
  const sill = 0.95
  const side = (w - winW) / 2
  slab(group, side, h, t, wall, -w / 2 + side / 2, h / 2, -d / 2)
  slab(group, side, h, t, wall, w / 2 - side / 2, h / 2, -d / 2)
  slab(group, winW, sill, t, wall, 0, sill / 2, -d / 2)
  const top = h - sill - winH
  slab(group, winW, top, t, wall, 0, sill + winH + top / 2, -d / 2)
  slab(group, winW + 0.12, 0.06, 0.08, trim, 0, sill, -d / 2 + 0.02)
  slab(group, winW + 0.12, 0.06, 0.08, trim, 0, sill + winH, -d / 2 + 0.02)
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW - 0.08, winH - 0.08),
    mat('#d5eef8', { transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.15 }),
  )
  glass.position.set(0, sill + winH / 2, -d / 2 + 0.02)
  group.add(glass)
}

function faceOffset(kind) {
  if (kind === 'lamp' || kind === 'plant' || kind === 'table') return 0
  return Math.PI
}

function makeFurniture(kind, glow) {
  const group = new THREE.Group()
  const woodMat = mat('#8a5a32', { roughness: 0.55 })
  const cloth = mat('#8d3d3a', { roughness: 0.86 })
  const cream = mat('#f4ead8', { roughness: 0.72 })
  if (kind === 'couch') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.28, 0.58), cloth)
    seat.position.y = 0.36
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.14), cloth)
    back.position.set(0, 0.66, -0.22)
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.46), cream)
    cushion.position.set(-0.3, 0.52, 0.02)
    const cushion2 = cushion.clone()
    cushion2.position.x = 0.3
    for (const x of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.58), cloth)
      arm.position.set(x, 0.52, 0)
      group.add(arm)
    }
    addLegs(group, woodMat, 1.1, 0.42)
    group.add(seat, back, cushion, cushion2)
  } else if (kind === 'lamp') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.05, 10), mat('#d7b15a', { metalness: 0.35, roughness: 0.35 }))
    pole.position.y = 0.62
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.22, 16),
      mat('#f6e2b8', { emissive: '#ffb45a', emissiveIntensity: 0.55, roughness: 0.45 }),
    )
    shade.position.y = 1.2
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), mat('#d7b15a', { metalness: 0.3 }))
    foot.position.y = 0.02
    group.add(pole, shade, foot)
    if (glow) {
      const light = new THREE.PointLight('#ffd39a', 0.45, 3.2)
      light.position.y = 1.15
      group.add(light)
    }
  } else if (kind === 'table') {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), woodMat)
    top.position.y = 0.62
    group.add(top)
    for (const [x, z] of [[0.22, 0.22], [0.22, -0.22], [-0.22, 0.22], [-0.22, -0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 8), woodMat)
      leg.position.set(x, 0.3, z)
      group.add(leg)
    }
  } else if (kind === 'plant') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.22, 12), mat('#c4513a'))
    pot.position.y = 0.11
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat('#2f7a45', { roughness: 0.85 }))
    leaf.position.y = 0.46
    const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), mat('#3f8f55'))
    leaf2.position.set(0.12, 0.62, 0.05)
    group.add(pot, leaf, leaf2)
  } else if (kind === 'chair') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), cream)
    seat.position.y = 0.46
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.06), mat('#1f7a72'))
    back.position.set(0, 0.74, -0.2)
    addLegs(group, woodMat, 0.34, 0.34)
    group.add(seat, back)
  } else if (kind === 'shelf') {
    const frame = mat('#6b4630')
    for (const x of [-0.42, 0.42]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.32), frame)
      side.position.set(x, 0.58, 0)
      group.add(side)
    }
    for (const y of [0.18, 0.55, 0.95]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.32), woodMat)
      board.position.y = y
      group.add(board)
    }
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.16), mat('#1f7a72'))
    book.position.set(-0.15, 0.68, 0)
    const book2 = book.clone()
    book2.material = mat('#c4513a')
    book2.position.x = 0.05
    group.add(book, book2)
  }
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  return group
}

function addLegs(group, material, spanX, spanZ) {
  for (const [x, z] of [[spanX / 2, spanZ / 2], [spanX / 2, -spanZ / 2], [-spanX / 2, spanZ / 2], [-spanX / 2, -spanZ / 2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8), material)
    leg.position.set(x, 0.11, z)
    group.add(leg)
  }
}

function makeNico() {
  const group = new THREE.Group()
  const skin = mat('#f0c7a4', { roughness: 0.62 })
  const shirt = mat('#3ecfb8', { roughness: 0.4, emissive: '#14685c', emissiveIntensity: 0.45 })
  const pants = mat('#f2c14e', { roughness: 0.55 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin)
  head.position.y = 1.55
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 5), mat('#f2c14e'))
  crown.position.y = 1.76
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), shirt)
  torso.position.y = 1.16
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.16), pants)
  hip.position.y = 0.86
  for (const x of [-0.08, 0.08]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 8), pants)
    leg.position.set(x, 0.46, 0)
    group.add(leg)
  }
  const armL = limb(shirt, -0.24)
  const armR = limb(shirt, 0.24)
  group.add(head, crown, torso, hip, armL, armR)
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  group.userData.arms = { left: armL, right: armR }
  group.scale.setScalar(1.25)
  return group
}

function limb(material, x) {
  const pivot = new THREE.Group()
  pivot.position.set(x, 1.38, 0)
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), material)
  mesh.position.y = -0.2
  pivot.add(mesh)
  return pivot
}

function exteriorHouse(house, index) {
  const spec = ROOMS[house.style]
  const group = new THREE.Group()
  const width = house.style === 'skinny' ? 1.35 : house.style === 'shotgun' ? 1.7 : 1.85
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, spec.h, 2.2),
    mat(spec.exterior, { roughness: 0.72, emissive: spec.exterior, emissiveIntensity: 0.28 }),
  )
  body.position.y = spec.h / 2
  body.castShadow = true
  body.receiveShadow = true
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.16, 2.45), mat(spec.trim))
  roof.position.y = spec.h + 0.08
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(width * 0.92, 2.2), 0.52),
    mat('#f6f1e8', { map: labelTexture(spec.name, '#f6f1e8', '#241c16'), roughness: 0.8 }),
  )
  name.position.set(0, spec.h * 0.62, 1.12)
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.56), mat('#d5eef8', { emissive: '#9fd0ea', emissiveIntensity: 0.25 }))
  windowPane.position.set(0, spec.h * 0.38, 1.12)
  group.add(body, roof, name, windowPane)
  group.position.set(-0.85, 0, 2.5 - index * 3.8)
  return group
}

function streetProp(kind) {
  const group = new THREE.Group()
  if (kind === 'bike') {
    const tire = mat('#241c16')
    const metal = mat('#f2c14e', { metalness: 0.2, roughness: 0.4 })
    for (const x of [-0.48, 0.48]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 10, 20), tire)
      wheel.rotation.y = Math.PI / 2
      wheel.position.set(x, 0.38, 0)
      group.add(wheel)
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), metal)
    frame.position.y = 0.55
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.28),
      mat('#f6f1e8', { map: labelTexture('Bikes', '#f6f1e8', '#241c16', 64) }),
    )
    sign.position.set(0, 0.95, 0.08)
    group.add(frame, sign)
  } else if (kind === 'mural') {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.55, 0.12),
      mat('#2a2118', { map: muralTexture(), roughness: 0.8 }),
    )
    wall.position.y = 0.85
    group.add(wall)
  } else if (kind === 'bench') {
    const woodMat = mat('#a56b3c', { roughness: 0.7 })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.36), woodMat)
    seat.position.y = 0.42
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.06), woodMat)
    back.position.set(0, 0.62, -0.14)
    group.add(seat, back)
    addLegs(group, mat('#3e3a36'), 0.9, 0.24)
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.22),
      mat('#f6f1e8', { map: labelTexture('Shelby Park', '#f6f1e8', '#241c16', 42) }),
    )
    sign.position.set(0, 0.92, 0.22)
    group.add(sign)
  } else if (kind === 'tabla') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), mat('#c4513a', { roughness: 0.75 }))
    crate.position.y = 0.28
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.36),
      mat('#f6f1e8', { map: labelTexture('Tabla Rasa', '#f6f1e8', '#241c16', 48) }),
    )
    sign.position.set(0, 0.72, 0.28)
    group.add(crate, sign)
  } else if (kind === 'corner') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), mat('#3e3a36'))
    pole.position.y = 0.8
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.48, 0.06),
      mat('#f2c14e', { map: labelTexture('Five Points', '#f2c14e', '#241c16', 46), roughness: 0.6 }),
    )
    board.position.y = 1.55
    group.add(pole, board)
  } else if (kind === 'lamppost') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.8, 8), mat('#2c2824'))
    pole.position.y = 0.9
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12),
      mat('#f6e2b8', { emissive: '#ffb45a', emissiveIntensity: 0.7 }),
    )
    lamp.position.y = 1.85
    group.add(pole, lamp)
  }
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  return group
}

function labelTexture(text, bg, ink, size = 54) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 160)
  ctx.fillStyle = ink
  ctx.font = `700 ${size}px Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 80)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function woodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c99563'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 ? '#b88350' : '#d7a56e'
    ctx.fillRect(0, i * 32, 256, 30)
    ctx.strokeStyle = 'rgba(70, 40, 18, 0.28)'
    ctx.beginPath()
    ctx.moveTo(0, i * 32 + 16)
    ctx.bezierCurveTo(80, i * 32 + 10, 160, i * 32 + 24, 256, i * 32 + 14)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.5, 2.5)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function muralTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#241c16'
  ctx.fillRect(0, 0, 256, 320)
  const blobs = ['#ee6d8a', '#f2c14e', '#3aa7a3', '#7d6bb5', '#f6f1e8']
  blobs.forEach((color, index) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(40 + (index % 3) * 70, 50 + index * 48, 36, 28 + index * 4, 0.4, 0, Math.PI * 2)
    ctx.fill()
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
