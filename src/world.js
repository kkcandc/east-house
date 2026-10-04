import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { BLOCK, ROOMS, activeHouse, bloopSpot, houseFootprint } from './logic.js'

const EYE = 1.62

const SHAPES = {
  couch: { hx: 0.68, hy: 0.38, hz: 0.32, mass: 34 },
  lamp: { hx: 0.16, hy: 0.62, hz: 0.16, mass: 4 },
  table: { hx: 0.42, hy: 0.34, hz: 0.42, mass: 16 },
  plant: { hx: 0.22, hy: 0.38, hz: 0.22, mass: 6 },
  chair: { hx: 0.24, hy: 0.42, hz: 0.24, mass: 8 },
  shelf: { hx: 0.46, hy: 0.58, hz: 0.18, mass: 22 },
  bike: { hx: 0.58, hy: 0.4, hz: 0.2, mass: 12 },
  mural: { hx: 0.68, hy: 0.78, hz: 0.14, mass: 48 },
  bench: { hx: 0.58, hy: 0.36, hz: 0.2, mass: 20 },
  tabla: { hx: 0.36, hy: 0.36, hz: 0.28, mass: 11 },
  corner: { hx: 0.22, hy: 0.82, hz: 0.16, mass: 16 },
  lamppost: { hx: 0.16, hy: 0.95, hz: 0.16, mass: 18 },
}

export function createWorld(canvas, RAPIER) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#c5dff0')

  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 50)
  camera.rotation.order = 'YXZ'

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const ssaoPass = new SSAOPass(scene, camera, 430, 800, 16)
  ssaoPass.kernelRadius = 14
  ssaoPass.minDistance = 0.0015
  ssaoPass.maxDistance = 0.22
  composer.addPass(ssaoPass)
  composer.addPass(new OutputPass())

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
  const gloveL = glove.clone()
  gloveL.visible = false
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.3), shoeMat)
  shoe.castShadow = true
  shoe.visible = false
  camera.add(glove, gloveL, shoe)
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
    streetItems: [],
    houseCount: 0,
    lane: 'sidewalk',
    pieceKind: null,
    duel: null,
    finisher: null,
    allowExit: false,
    doorZ: 0,
    exited: false,
    shake: 0,
  }

  let sim = null
  const loose = new Set()
  const api = { onRest: null }

  function destroySim() {
    loose.clear()
    if (sim) {
      sim.world.free()
      sim = null
    }
  }

  function bootSim(x, z) {
    destroySim()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const controller = world.createCharacterController(0.03)
    controller.setSlideEnabled(true)
    controller.enableSnapToGround(0.45)
    controller.setApplyImpulsesToDynamicBodies(true)
    controller.setMaxSlopeClimbAngle((48 * Math.PI) / 180)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0.58, z),
    )
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.36, 0.22), body)
    sim = { world, controller, body, collider }
  }

  function addFixed(x, y, z, hx, hy, hz) {
    if (!sim) return
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)
  }

  function addRoomSolids(spec) {
    const { w, d, h } = spec
    addFixed(0, -0.1, 0, w / 2, 0.1, d / 2)
    addFixed(-w / 2, h / 2, 0, 0.1, h / 2, d / 2)
    addFixed(w / 2, h / 2, 0, 0.1, h / 2, d / 2)
    addFixed(0, h / 2, -d / 2, w / 2, h / 2, 0.1)
    const doorW = 0.96
    const doorH = 2.08
    const side = (w - doorW) / 2
    const z = d / 2
    addFixed(-w / 2 + side / 2, h / 2, z, side / 2, h / 2, 0.1)
    addFixed(w / 2 - side / 2, h / 2, z, side / 2, h / 2, 0.1)
    addFixed(0, doorH + (h - doorH) / 2, z, doorW / 2, (h - doorH) / 2, 0.1)
  }

  function addLoose(mesh, kind, id, settled) {
    if (!sim || mesh.userData.body) return
    const shape = SHAPES[kind]
    if (!shape) return
    const yaw = mesh.rotation.y
    const lift = shape.hy
    const y = settled ? lift : lift + 0.34
    const desc = (settled ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(mesh.position.x, y, mesh.position.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(3.1)
      .setAngularDamping(6)
      .setCanSleep(true)
      .setCcdEnabled(true)
    const body = sim.world.createRigidBody(desc)
    if (!settled) body.setEnabledRotations(false, true, false, true)
    const volume = shape.hx * shape.hy * shape.hz * 8
    const collider = RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz)
      .setFriction(0.94)
      .setRestitution(0.02)
      .setDensity(shape.mass / volume)
    sim.world.createCollider(collider, body)
    mesh.userData.body = body
    mesh.userData.lift = lift
    mesh.userData.kind = kind
    mesh.userData.id = id
    mesh.userData.rested = Boolean(settled)
    mesh.userData.age = 0
    loose.add(mesh)
  }

  function restLoose(mesh) {
    const body = mesh.userData.body
    if (!body || mesh.userData.rested) return
    mesh.userData.rested = true
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    const yaw = mesh.rotation.y - faceOffset(mesh.userData.kind)
    api.onRest?.(mesh.userData.id, {
      x: mesh.position.x,
      z: mesh.position.z,
      rot: yaw,
      settled: true,
    })
  }

  function stepSim(dt, wishX, wishZ) {
    if (!sim) return
    const { world, controller, body, collider } = sim
    controller.computeColliderMovement(collider, { x: wishX, y: -2.4 * dt, z: wishZ })
    const moved = controller.computedMovement()
    const t = body.translation()
    const next = {
      x: t.x + moved.x,
      y: Math.max(0.58, t.y + moved.y),
      z: t.z + moved.z,
    }
    if (state3.bounds) {
      const { minX, maxX, minZ, maxZ } = state3.bounds
      next.x = clamp(next.x, minX, maxX)
      next.z = clamp(next.z, minZ, maxZ)
    }
    body.setNextKinematicTranslation(next)
    world.timestep = Math.min(0.033, Math.max(dt, 0.001))
    world.step()
    const now = body.translation()
    state3.px = now.x
    state3.pz = now.z
    for (const mesh of loose) {
      const actor = mesh.userData.body
      if (!actor) continue
      const p = actor.translation()
      mesh.position.set(p.x, Math.max(0, p.y - mesh.userData.lift), p.z)
      const q = actor.rotation()
      mesh.rotation.y = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z))
      mesh.userData.age += dt
      if (mesh.userData.rested) continue
      const velocity = actor.linvel()
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
      if (actor.isSleeping() || (mesh.userData.age > 0.9 && speed < 0.12)) restLoose(mesh)
    }
  }

  function resize() {
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    ssaoPass.setSize(width, height)
  }

  function forward() {
    return { x: -Math.sin(state3.yaw), z: -Math.cos(state3.yaw) }
  }

  function applyCamera() {
    const eye = EYE
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
    state3.doorZ = d / 2
    state3.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 - 0.28 }
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
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, 0.55), mat('#f2c14e'))
    threshold.position.set(0, 0.02, d / 2 - 0.42)
    threshold.receiveShadow = true
    roomGroup.add(threshold)

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
      bootSim(state3.px, state3.pz)
      addRoomSolids(ROOMS[house.style])
    }
    syncFurniture(house.furniture || [])
  }

  function showStreet(game, reset) {
    state3.mode = 'street'
    roomGroup.visible = false
    streetGroup.visible = true
    state3.floor = null
    state3.streetItems = game.street || []
    state3.houseCount = game.kept?.length || 0
    buildStreet(game)
    state3.bounds = {
      minX: BLOCK.sidewalk.minX + 0.15,
      maxX: BLOCK.street.maxX - 0.2,
      minZ: BLOCK.minZ + 0.4,
      maxZ: BLOCK.maxZ - 0.4,
    }
    if (reset) {
      state3.px = 1.15
      state3.pz = 6.6
      state3.yaw = 0
      state3.pitch = -0.08
    }
    bootSim(state3.px, state3.pz)
    addFixed(1.6, -0.12, 0.4, 6, 0.12, 12)
    game.kept.forEach((_, index) => {
      const box = houseFootprint(index)
      addFixed(
        (box.minX + box.maxX) / 2,
        1.4,
        (box.minZ + box.maxZ) / 2,
        (box.maxX - box.minX) / 2,
        1.4,
        (box.maxZ - box.minZ) / 2,
      )
    })
    streetGroup.traverse((obj) => {
      if (obj.userData?.looseKind) addLoose(obj, obj.userData.looseKind, obj.userData.id, obj.userData.settled)
    })
  }

  function syncFurniture(items) {
    if (!state3.furniture) return
    const need = new Set(items.map((item) => item.id))
    for (const child of [...state3.furniture.children]) {
      if (!need.has(child.userData.id)) {
        loose.delete(child)
        state3.furniture.remove(child)
      }
    }
    for (const item of items) {
      if (state3.furniture.children.some((child) => child.userData.id === item.id)) continue
      const mesh = makeFurniture(item.kind, true)
      mesh.userData.id = item.id
      mesh.position.set(item.x, 0, item.z)
      mesh.rotation.y = item.rot + faceOffset(item.kind)
      state3.furniture.add(mesh)
      addLoose(mesh, item.kind, item.id, item.settled)
    }
  }

  const streetGhost = new THREE.Group()
  scene.add(streetGhost)
  const popCanvas = document.createElement('canvas')
  popCanvas.width = 256
  popCanvas.height = 128
  const popCtx = popCanvas.getContext('2d')
  const popMap = new THREE.CanvasTexture(popCanvas)
  popMap.colorSpace = THREE.SRGBColorSpace
  const popSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: popMap, transparent: true, depthTest: false }))
  popSprite.scale.set(0.95, 0.48, 1)
  popSprite.visible = false
  scene.add(popSprite)
  let popLife = 0

  function showPop(text) {
    popCtx.clearRect(0, 0, 256, 128)
    popCtx.fillStyle = '#f2c14e'
    popCtx.font = '700 68px Georgia, serif'
    popCtx.textAlign = 'center'
    popCtx.textBaseline = 'middle'
    popCtx.fillText(text, 128, 64)
    popMap.needsUpdate = true
    popSprite.visible = true
    popLife = 0.5
  }

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.48, 28),
    new THREE.MeshBasicMaterial({ color: '#f2c14e', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  )
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  scene.add(marker)

  function aimPoint() {
    const dir = forward()
    return {
      x: state3.px + dir.x * 1.55,
      z: state3.pz + dir.z * 1.55,
      rot: state3.yaw,
    }
  }

  function placePoint() {
    return aimPoint()
  }

  function dropPoint() {
    const dir = forward()
    const spot = bloopSpot(
      state3.lane,
      state3.px,
      state3.pz,
      state3.px + dir.x * 0.95,
      state3.pz + dir.z * 0.95,
      state3.streetItems,
      state3.houseCount,
    )
    return { ...spot, rot: state3.yaw }
  }

  function fightDistance() {
    if (!state3.nico) return 9
    return Math.hypot(state3.px - state3.nico.position.x, state3.pz - state3.nico.position.z)
  }

  function separateFromNico() {
    if (!state3.nico?.visible) return
    const dx = state3.px - state3.nico.position.x
    const dz = state3.pz - state3.nico.position.z
    const dist = Math.hypot(dx, dz) || 0.001
    if (dist >= 0.72) return
    state3.px = state3.nico.position.x + (dx / dist) * 0.72
    state3.pz = state3.nico.position.z + (dz / dist) * 0.72
    sim?.body.setTranslation({ x: state3.px, y: 0.58, z: state3.pz }, true)
  }

  function moveNico(dt, duel) {
    const nico = state3.nico
    let nx = nico.position.x
    let nz = nico.position.z
    const dx = state3.px - nx
    const dz = state3.pz - nz
    const dist = Math.hypot(dx, dz) || 0.001
    const ux = dx / dist
    const uz = dz / dist
    const phase = state3.finisher === 'win' ? 'bow' : duel.nicoPhase
    let speed = 0
    if (phase === 'approach') speed = dist > 1.72 ? 1.45 : 0
    else if (phase === 'guard') speed = dist > 1.9 ? 0.65 : dist < 1.22 ? -0.5 : 0
    else if (phase === 'windup') {
      speed = duel.nicoAttack === 'kick'
        ? (dist > 1.95 ? 0.4 : dist < 1.65 ? -0.45 : 0)
        : (dist > 1.38 ? 0.6 : 0)
    } else if (phase === 'recover' || phase === 'stagger' || phase === 'bow') speed = dist < 2.15 ? -1.15 : 0
    let sx = 0
    let sz = 0
    if (phase === 'guard') {
      sx = -uz * Math.sin(state3.time * 1.4) * 0.45
      sz = ux * Math.sin(state3.time * 1.4) * 0.45
    }
    nx += (ux * speed + sx) * dt
    nz += (uz * speed + sz) * dt
    for (const mesh of loose) {
      const ox = nx - mesh.position.x
      const oz = nz - mesh.position.z
      const od = Math.hypot(ox, oz)
      if (od < 0.72 && od > 0.001) {
        nx += (ox / od) * (0.72 - od)
        nz += (oz / od) * (0.72 - od)
      }
    }
    if (state3.bounds) {
      nx = clamp(nx, state3.bounds.minX + 0.4, state3.bounds.maxX - 0.4)
      nz = clamp(nz, state3.bounds.minZ + 0.4, Math.min(state3.bounds.maxZ, state3.doorZ - 0.35))
    }
    const pdx = nx - state3.px
    const pdz = nz - state3.pz
    const pd = Math.hypot(pdx, pdz) || 0.001
    if (pd < 0.78) {
      nx = state3.px + (pdx / pd) * 0.78
      nz = state3.pz + (pdz / pd) * 0.78
    }
    nico.position.x = nx
    nico.position.z = nz
    nico.rotation.y = Math.atan2(state3.px - nx, state3.pz - nz)
  }

  function poseNico(duel) {
    const nico = state3.nico
    const parts = nico.userData.parts
    if (!parts) return
    const phase = state3.finisher === 'win' ? 'bow' : state3.finisher === 'lose' ? 'stagger' : duel.nicoPhase
    const attack = duel.nicoAttack
    const wind = Math.min(1, duel.phaseT / 0.28)
    let armLx = 0.45
    let armLz = 1.05
    let armRx = 0.45
    let armRz = -1.05
    let legRx = 0
    let lean = 0
    if (phase === 'approach') {
      armLx = 0.4
      armRx = 0.4
      lean = Math.sin(state3.time * 8) * 0.04
    } else if (phase === 'windup' && attack === 'kick') {
      legRx = -1.2 * wind
      lean = -0.1 * wind
    } else if (phase === 'windup') {
      armRx = -1.35 * wind
      armRz = -0.35
      lean = -0.16 * wind
    } else if (phase === 'strike' && attack === 'kick') {
      legRx = -1.2 + 2.25 * Math.min(1, duel.phaseT / 0.12)
      lean = 0.1
    } else if (phase === 'strike') {
      armRx = -1.35 + 2.55 * Math.min(1, duel.phaseT / 0.1)
      armRz = -0.15
      lean = 0.14
    } else if (phase === 'recover') {
      armLx = 0.2
      armRx = 0.25
      armLz = 0.35
      armRz = -0.35
      lean = 0.1
    } else if (phase === 'stagger') {
      armLx = -0.5
      armRx = -0.5
      armLz = 0.2
      armRz = -0.2
      lean = -0.38
    } else if (phase === 'bow') {
      armLx = 0.9
      armRx = 0.9
      armLz = 0.15
      armRz = -0.15
      lean = 0.75
    }
    parts.armL.rotation.x = armLx
    parts.armL.rotation.z = armLz
    parts.armR.rotation.x = armRx
    parts.armR.rotation.z = armRz
    parts.legR.rotation.x = legRx
    parts.body.rotation.x = lean
    parts.crown.rotation.z = (phase === 'stagger' ? 0.5 : phase === 'windup' ? 0.2 : 0) + Math.sin(state3.time * 2.5) * 0.05
    const open = phase === 'recover'
    parts.ring.material.color.set(phase === 'windup' ? '#f2c14e' : open ? '#7dcea0' : '#241c16')
    parts.ring.material.opacity = phase === 'windup' || open ? 0.9 : 0.28
    nico.position.y = Math.abs(Math.sin(state3.time * (phase === 'approach' ? 8 : 3))) * 0.025
  }

  function poseHands(duel) {
    const move = state3.finisher ? 'ready' : duel.playerMove
    const t = duel.moveT
    glove.visible = false
    gloveL.visible = false
    shoe.visible = false
    if (move === 'punch') {
      glove.visible = true
      const extend = t < 0.1 ? -0.12 : Math.sin(Math.min(1, (t - 0.1) / 0.16) * Math.PI)
      glove.position.set(0.18, -0.14, -0.32 - Math.max(0, extend) * 0.82)
    } else if (move === 'kick') {
      shoe.visible = true
      const extend = t < 0.18 ? 0.02 : Math.sin(Math.min(1, (t - 0.18) / 0.18) * Math.PI)
      shoe.position.set(0.06, -0.36 + extend * 0.12, -0.32 - extend * 0.95)
    } else if (move === 'block') {
      glove.visible = true
      gloveL.visible = true
      const bob = Math.sin(state3.time * 16) * 0.012
      glove.position.set(0.14, -0.06 + bob, -0.26)
      gloveL.position.set(-0.14, -0.06 + bob, -0.26)
    } else if (move === 'hurt') {
      glove.visible = true
      gloveL.visible = true
      glove.position.set(0.2, -0.34, -0.16)
      gloveL.position.set(-0.16, -0.3, -0.14)
    }
  }

  function syncStreetGhost(kind, drop) {
    if (!kind) {
      streetGhost.visible = false
      return
    }
    if (streetGhost.userData.kind !== kind) {
      clear(streetGhost)
      const mesh = streetProp(kind)
      mesh.traverse((obj) => {
        if (!obj.isMesh) return
        obj.material = obj.material.clone()
        obj.material.transparent = true
        obj.material.opacity = 0.45
        obj.castShadow = false
      })
      streetGhost.add(mesh)
      streetGhost.userData.kind = kind
    }
    streetGhost.position.set(drop.x, 0.02, drop.z)
    streetGhost.rotation.y = drop.rot || 0
    streetGhost.visible = true
    const tint = drop.ok ? 0.45 : 0.28
    streetGhost.traverse((obj) => {
      if (obj.isMesh && obj.material) obj.material.opacity = tint
    })
  }

  function spawnAt(x, z, yaw, pitch) {
    state3.px = x
    state3.pz = z
    state3.yaw = yaw
    state3.pitch = pitch
    sim?.body.setTranslation({ x, y: 0.58, z }, true)
    applyCamera()
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
    const x = clamp(state3.px + dir.x * 2.55, minX + 0.5, maxX - 0.5)
    const z = clamp(state3.pz + dir.z * 2.55, minZ + 0.5, maxZ - 0.5)
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
      marker.visible = false
      streetGhost.visible = false
      composer.render()
      return
    }

    if (state3.mode !== 'fight-frozen') {
      const looked = Math.abs(input.lookX || 0) > 0.0001 || Math.abs(input.lookY || 0) > 0.0001
      state3.yaw -= input.lookX || 0
      state3.pitch = clamp(state3.pitch - (input.lookY || 0), -0.95, 0.55)
      input.lookX = 0
      input.lookY = 0
      if (state3.nico?.visible && !looked && !state3.finisher) {
        const dx = state3.nico.position.x - state3.px
        const dz = state3.nico.position.z - state3.pz
        const want = Math.atan2(-dx, -dz)
        let diff = want - state3.yaw
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        state3.yaw += clamp(diff, -1.5 * dt, 1.5 * dt)
      }
      const dirVec = forward()
      const rx = -dirVec.z
      const rz = dirVec.x
      const speed = 2.45 * dt
      const forwardAmt = input.forward || 0
      const strafe = input.strafe || 0
      const wishX = dirVec.x * forwardAmt * speed + rx * strafe * speed
      const wishZ = dirVec.z * forwardAmt * speed + rz * strafe * speed
      if (state3.mode === 'interior' || state3.mode === 'street') {
        if (sim) stepSim(dt, wishX, wishZ)
        else tryMove(wishX, wishZ)
      }
      separateFromNico()
      if (state3.allowExit && state3.pz > state3.doorZ + 0.02) state3.exited = true
    }
    applyCamera()
    if (state3.shake > 0) {
      state3.shake = Math.max(0, state3.shake - dt * 2.4)
      camera.position.x += Math.sin(state3.time * 58) * 0.035 * state3.shake
      camera.position.y += Math.cos(state3.time * 46) * 0.02 * state3.shake
    }

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

    if (state3.mode === 'street') {
      const spot = dropPoint()
      marker.position.set(spot.x, 0.09, spot.z)
      marker.material.color.set(spot.ok ? '#7dcea0' : '#e07a5f')
      marker.visible = true
      syncStreetGhost(state3.pieceKind, spot)
    } else {
      marker.visible = false
      streetGhost.visible = false
    }

    if (state3.nico?.visible && state3.duel) {
      moveNico(dt, state3.duel)
      poseNico(state3.duel)
      poseHands(state3.duel)
    } else {
      glove.visible = false
      gloveL.visible = false
      shoe.visible = false
      if (state3.nico) state3.nico.rotation.x = 0
    }
    if (popLife > 0) {
      popLife -= dt
      popSprite.position.set(state3.nico?.position.x || state3.px, 2.05 + (0.5 - popLife) * 0.35, state3.nico?.position.z || state3.pz)
      popSprite.material.opacity = Math.max(0, popLife / 0.5)
      popSprite.visible = popLife > 0
    }

    if (state3.strike && !state3.duel) {
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

    composer.render()
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

    const sideCenter = (BLOCK.sidewalk.minX + BLOCK.sidewalk.maxX) / 2
    const sideWidth = BLOCK.sidewalk.maxX - BLOCK.sidewalk.minX + 0.25
    const walk = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, 0.08, 22), mat('#e4d5c0', { roughness: 0.95 }))
    walk.position.set(sideCenter, 0.04, 0.5)
    walk.receiveShadow = true
    streetGroup.add(walk)

    const roadCenter = (BLOCK.street.minX + BLOCK.street.maxX) / 2
    const roadWidth = BLOCK.street.maxX - BLOCK.street.minX + 0.35
    const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.04, 22), mat('#3c3834', { roughness: 0.9 }))
    road.position.set(roadCenter, 0.03, 0.5)
    road.receiveShadow = true
    streetGroup.add(road)

    for (let i = 0; i < 10; i += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.7), mat('#f6f1e8'))
      dash.position.set(roadCenter, 0.06, 6.4 - i * 1.7)
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
      prop.position.set(piece.x, 0, piece.z)
      prop.rotation.y = piece.rot || 0
      prop.userData.looseKind = piece.kind
      prop.userData.id = piece.id
      prop.userData.settled = Boolean(piece.settled)
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
    dropPoint,
    fightDistance,
    rayPlace,
    spawnOutside(index) {
      const lot = houseFootprint(Math.max(0, index))
      spawnAt(1.05, lot.z, 0, -0.24)
    },
    consumeExit() {
      const exited = state3.exited
      state3.exited = false
      return exited
    },
    react(kind) {
      if (kind === 'hurt') state3.shake = 1
      if (kind === 'counter' || kind === 'hit') {
        state3.shake = 0.55
        showPop(kind === 'counter' ? 'Counter' : 'Tap')
      }
      if (kind === 'blocked') showPop('Blocked')
      if (kind === 'clang') showPop('Covered')
    },
    sync(game, { reset = false } = {}) {
      const interior = game.screen === 'decorate' || game.screen === 'fight' || game.screen === 'kept'
      if (interior) {
        const house = activeHouse(game)
        showInterior(house, reset || state3.mode !== 'interior')
        state3.mode = 'interior'
        camera.fov = 68
        camera.updateProjectionMatrix()
        if (state3.nico) state3.nico.visible = game.screen === 'fight'
        state3.allowExit = game.screen === 'kept'
        if (state3.bounds) {
          state3.bounds.maxZ = state3.allowExit ? state3.doorZ + 0.85 : state3.doorZ - 0.28
        }
      } else if (game.screen === 'pick') {
        state3.allowExit = false
        if (state3.mode !== 'pick') {
          showStreet(game, true)
          state3.mode = 'pick'
        }
      } else {
        state3.allowExit = false
        showStreet(game, reset || state3.mode === 'interior' || state3.mode === 'pick')
        state3.mode = 'street'
        camera.fov = 68
        camera.updateProjectionMatrix()
      }
    },
    set ghostKind(value) {
      state3.ghostKind = value
    },
    set lane(value) {
      state3.lane = value
    },
    set pieceKind(value) {
      state3.pieceKind = value
    },
    set duel(value) {
      state3.duel = value
    },
    set finisher(value) {
      state3.finisher = value
    },
    set onRest(fn) {
      api.onRest = fn
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
  if (kind === 'couch' || kind === 'chair' || kind === 'shelf') return Math.PI
  return 0
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
  const body = new THREE.Group()
  const skin = mat('#f0c7a4', { roughness: 0.62 })
  const shirt = mat('#3ecfb8', { roughness: 0.4, emissive: '#14685c', emissiveIntensity: 0.45 })
  const pants = mat('#f2c14e', { roughness: 0.55 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin)
  head.position.y = 1.55
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mat('#241c16'))
  eye.position.set(-0.05, 1.58, 0.13)
  const eyeR = eye.clone()
  eyeR.position.x = 0.05
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 5), mat('#f2c14e', { emissive: '#f2c14e', emissiveIntensity: 0.35 }))
  crown.position.y = 1.78
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), shirt)
  torso.position.y = 1.16
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.16), pants)
  hip.position.y = 0.86
  const armL = limb(shirt, -0.24)
  const armR = limb(shirt, 0.24)
  const legL = legPivot(pants, -0.08)
  const legR = legPivot(pants, 0.08)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.48, 28),
    new THREE.MeshBasicMaterial({ color: '#241c16', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  body.add(head, eye, eyeR, crown, torso, hip, armL, armR, legL, legR)
  group.add(body, ring)
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  ring.castShadow = false
  group.userData.parts = { body, armL, armR, legL, legR, crown, ring }
  group.userData.arms = { left: armL, right: armR }
  group.scale.setScalar(1.2)
  return group
}

function legPivot(material, x) {
  const pivot = new THREE.Group()
  pivot.position.set(x, 0.78, 0)
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), material)
  mesh.position.y = -0.26
  pivot.add(mesh)
  return pivot
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
  const lot = houseFootprint(index)
  group.position.set((lot.minX + lot.maxX) / 2, 0, (lot.minZ + lot.maxZ) / 2)
  group.rotation.y = Math.PI / 2
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
