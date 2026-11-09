import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Layout = { width: number; height: number; blocks: Point[]; exit: Point; table: Point; name: string }
type Hazard = Point & { id: number; createdTurn: number; delay: number }
type Enemy = Point & {
  id: number
  kind: 'slime' | 'skeleton' | 'bat' | 'boss'
  hp: number
  maxHp: number
  attack: number
  xp: number
  name: string
}
type Chest = Point & { id: number; opened: boolean }
type GameState = {
  floor: number
  turn: number
  player: Point & {
    hp: number
    maxHp: number
    attack: number
    level: number
    xp: number
    xpNext: number
    gold: number
    potions: number
    runes: number
    shards: number
    sprint: number
    speedUpgrades: number
    damageUpgrades: number
    healthUpgrades: number
    attackCooldown: number
  }
  layout: Layout
  enemies: Enemy[]
  chests: Chest[]
  hazards: Hazard[]
  messages: string[]
  status: 'playing' | 'dead' | 'won'
  flash: 'hurt' | 'level' | 'attack' | null
  attackerId: number | null
}

const SPRINT_MAX = 0.65
const ATTACK_COOLDOWN = 0.2
const BOSS_CYCLE = 180
const BOSS_WAVE_END = 90

const ICONS = {
  heart: 'M12 21s-8.5-5.2-8.5-12A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 3c0 6.8-8.5 12-8.5 12Z',
  sword: 'm14.5 4.5 5-1-1 5-9.2 9.2-3 1-1-1 1-3 9.2-9.2Z',
  coin: 'M12 3c5 0 8 2 8 4s-3 4-8 4-8-2-8-4 3-4 8-4Zm-8 4v5c0 2 3 4 8 4s8-2 8-4V7m-16 5v5c0 2 3 4 8 4s8-2 8-4v-5',
  flask: 'M9 3h6m-5 0v6l-5 8a2.5 2.5 0 0 0 2 4h10a2.5 2.5 0 0 0 2-4l-5-8V3m-6 12h8',
  bolt: 'm13 2-8 12h6l-1 8 9-13h-6V2Z',
}

function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={ICONS[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const directDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const isWall = (p: Point, layout: Layout) =>
  p.x <= 0 || p.y <= 0 || p.x >= layout.width - 1 || p.y >= layout.height - 1 || layout.blocks.some((b) => same(b, p))
const canStandAt = (p: Point, layout: Layout, radius = 0.27) => {
  // Entity positions are their top-left tile coordinates; collision is measured
  // from the visual center so walls line up exactly with the sprites.
  const centerX = p.x + 0.5
  const centerY = p.y + 0.5
  const left = Math.floor(centerX - radius)
  const right = Math.floor(centerX + radius)
  const top = Math.floor(centerY - radius)
  const bottom = Math.floor(centerY + radius)
  return ![
    { x: left, y: top }, { x: right, y: top },
    { x: left, y: bottom }, { x: right, y: bottom },
  ].some((point) => isWall(point, layout))
}

const bossIsVulnerable = (turn: number) => turn % BOSS_CYCLE >= BOSS_WAVE_END

function makeLayout(floor: number): Layout {
  const width = 17 + floor
  const height = 10 + Math.ceil(floor * 0.65)
  const exit = { x: width - 2, y: height - 2 }
  const table = { x: 2, y: Math.min(5, height - 3) }
  const blocks: Point[] = []
  const format = floor % 3

  if (format === 1) {
    const pillars = [
      { x: 5, y: 3 }, { x: width - 6, y: 3 },
      { x: 5, y: height - 4 }, { x: width - 6, y: height - 4 },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    ]
    pillars.forEach((pillar, index) => {
      blocks.push(pillar)
      if (index < 4) blocks.push({ x: pillar.x + (index % 2 ? -1 : 1), y: pillar.y })
    })
  } else if (format === 2) {
    const columns = [Math.floor(width / 3), Math.floor(width * 2 / 3)]
    columns.forEach((x, column) => {
      for (let y = 2; y < height - 2; y += 1) {
        const gap = column === 0 ? Math.floor(height * 0.35) : Math.floor(height * 0.65)
        if (Math.abs(y - gap) > 1) blocks.push({ x, y })
      }
    })
  } else {
    const centerX = Math.floor(width / 2)
    const centerY = Math.floor(height / 2)
    ;[-2, 2].forEach((offsetX) => {
      ;[-2, 2].forEach((offsetY) => {
        blocks.push({ x: centerX + offsetX, y: centerY + offsetY })
      })
    })
  }

  const reserved = [
    { x: 2, y: 2 }, table, exit,
    { x: width - 3, y: 2 }, { x: width - 4, y: 3 },
    { x: 2, y: height - 3 }, { x: width - 3, y: 5 },
    { x: width - 6, y: height - 4 }, { x: 6, y: Math.min(5, height - 3) },
    { x: 7, y: height - 3 }, { x: Math.floor(width / 2), y: 2 },
    { x: 3, y: height - 5 }, { x: width - 3, y: height - 3 },
  ]
  return {
    width,
    height,
    blocks: blocks.filter((block) => !reserved.some((point) => directDistance(block, point) < 1.5)),
    exit,
    table,
    name: format === 0 ? 'THE ASHEN ARENA' : format === 1 ? 'THE HOLLOW CRYPT' : 'THE SPLIT CATACOMBS',
  }
}

function makeFloor(floor: number, old?: GameState['player']): GameState {
  const layout = makeLayout(floor)
  const bossFloor = floor % 3 === 0
  const count = bossFloor ? Math.min(3, floor) : Math.min(3 + floor, 7)
  const spawns: Point[] = [
    { x: layout.width - 3, y: 2 },
    { x: layout.width - 6, y: layout.height - 4 },
    { x: 6, y: Math.min(5, layout.height - 3) },
    { x: layout.width - 4, y: Math.min(5, layout.height - 3) },
    { x: 7, y: layout.height - 3 },
    { x: Math.floor(layout.width / 2), y: 2 },
    { x: 3, y: layout.height - 5 },
    { x: layout.width - 3, y: layout.height - 3 },
  ]
  const enemies: Enemy[] = Array.from({ length: count }, (_, i) => {
    const kind: Enemy['kind'] = bossFloor && i === 0 ? 'boss' : (['slime', 'skeleton', 'bat'] as const)[(i + floor) % 3]
    const base = kind === 'boss' ? 85 + floor * 15 : 12 + floor * 5
    return {
      ...spawns[i],
      id: floor * 100 + i,
      kind,
      hp: base,
      maxHp: base,
      attack: kind === 'boss' ? 10 + floor * 2 : 3 + Math.ceil(floor * 1.25),
      xp: kind === 'boss' ? 45 + floor * 4 : 8 + floor * 2,
      name: kind === 'boss' ? (floor === 3 ? 'Crypt Warden' : 'Void King') : `${kind[0].toUpperCase()}${kind.slice(1)}`,
    }
  })

  return {
    floor,
    turn: 0,
    layout,
    player: {
      x: 2, y: 2,
      hp: old ? Math.min(old.maxHp, old.hp + Math.ceil(old.maxHp * 0.35)) : 32,
      maxHp: old?.maxHp ?? 32,
      attack: old?.attack ?? 6,
      level: old?.level ?? 1,
      xp: old?.xp ?? 0,
      xpNext: old?.xpNext ?? 30,
      gold: old?.gold ?? 0,
      potions: old?.potions ?? 0,
      runes: old?.runes ?? 0,
      shards: old?.shards ?? 0,
      sprint: Math.min(old?.sprint ?? SPRINT_MAX, SPRINT_MAX),
      speedUpgrades: old?.speedUpgrades ?? 0,
      damageUpgrades: old?.damageUpgrades ?? 0,
      healthUpgrades: old?.healthUpgrades ?? 0,
      attackCooldown: 0,
    },
    enemies,
    chests: [
      { id: floor * 10, x: 2, y: layout.height - 3, opened: false },
      ...(floor % 2 === 0 ? [{ id: floor * 10 + 1, x: layout.width - 3, y: 5, opened: false }] : []),
    ],
    hazards: [],
    messages: [
      bossFloor ? `A terrible presence rules floor ${floor}.` : `You descend to dungeon floor ${floor}.`,
      bossFloor ? 'Boss floor — prepare yourself.' : 'Defeat every enemy to open the gate.',
    ],
    status: 'playing',
    flash: null,
    attackerId: null,
  }
}

function addMessage(messages: string[], next: string) {
  return [next, ...messages].slice(0, 4)
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => makeFloor(1))
  const [selectedItem, setSelectedItem] = useState(0)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const heldKeys = useRef(new Set<string>())
  const upgradeOpenRef = useRef(false)
  const gameRef = useRef(game)
  const layout = game.layout ?? makeLayout(game.floor)
  gameRef.current = { ...game, layout, hazards: game.hazards ?? [] }
  const cleared = game.enemies.length === 0
  const boss = game.enemies.find((enemy) => enemy.kind === 'boss')

  const takeAction = useCallback((action: 'attack' | 'interact' | 'potion' | 'rune' | 'shard') => {
    const snapshot = gameRef.current
    if (action === 'interact' && snapshot.status === 'playing' && directDistance(snapshot.player, snapshot.layout.table) <= 1.4) {
      heldKeys.current.clear()
      upgradeOpenRef.current = true
      setUpgradeOpen(true)
      setGame((current) => ({ ...current, messages: addMessage(current.messages, 'The Forge Table hums with ancient power.') }))
      return
    }
    setGame((current) => {
      if (current.status !== 'playing') return current
      let state: GameState = {
        ...current,
        layout: current.layout ?? makeLayout(current.floor),
        hazards: current.hazards ?? [],
        player: { ...current.player, attackCooldown: current.player.attackCooldown ?? 0 },
        flash: null,
      }
      let spentTurn = false

      if (action === 'potion') {
        if (state.player.potions <= 0) return { ...state, messages: addMessage(state.messages, 'Your potion pouch is empty.') }
        if (state.player.hp === state.player.maxHp) return { ...state, messages: addMessage(state.messages, 'You are already at full health.') }
        const healed = Math.min(18, state.player.maxHp - state.player.hp)
        state = {
          ...state,
          player: { ...state.player, hp: state.player.hp + healed, potions: state.player.potions - 1 },
          messages: addMessage(state.messages, `You recover ${healed} health.`),
        }
        spentTurn = true
      }

      if (action === 'rune') {
        if ((state.player.runes ?? 0) <= 0) return { ...state, messages: addMessage(state.messages, 'You have no power runes.') }
        state = {
          ...state,
          player: { ...state.player, runes: state.player.runes - 1, attack: state.player.attack + 1 },
          messages: addMessage(state.messages, 'Power rune consumed. Attack increased by 1.'),
          flash: 'level',
        }
        spentTurn = true
      }

      if (action === 'shard') {
        if ((state.player.shards ?? 0) <= 0) return { ...state, messages: addMessage(state.messages, 'You have no heart shards.') }
        state = {
          ...state,
          player: {
            ...state.player,
            shards: state.player.shards - 1,
            maxHp: state.player.maxHp + 5,
            hp: state.player.hp + 5,
          },
          messages: addMessage(state.messages, 'Heart shard consumed. Maximum vitality increased.'),
          flash: 'level',
        }
        spentTurn = true
      }

      if (action === 'attack') {
        if ((state.player.attackCooldown ?? 0) > 0) return state
        state.player = { ...state.player, attackCooldown: ATTACK_COOLDOWN }
        const target = state.enemies
          .filter((enemy) => directDistance(enemy, state.player) <= 1.3)
          .sort((a, b) => directDistance(a, state.player) - directDistance(b, state.player))[0]
        if (!target) return { ...state, flash: 'attack' }
        if (target.kind === 'boss' && !bossIsVulnerable(state.turn)) {
          return { ...state, flash: 'attack', messages: addMessage(state.messages, `${target.name} is shielded during the wave!`) }
        }
        state.flash = 'attack'
        const damage = state.player.attack + (state.turn % 3 === 0 ? 2 : 0)
        const killed = target.hp <= damage
        let enemies = killed
          ? state.enemies.filter((enemy) => enemy.id !== target.id)
          : state.enemies.map((enemy) => enemy.id === target.id ? { ...enemy, hp: enemy.hp - damage } : enemy)
        let player = { ...state.player }
        let messages = addMessage(state.messages, killed ? `${target.name} falls. +${target.xp} XP` : `You slash ${target.name} for ${damage}.`)
        if (killed) {
          player.xp += target.xp
          player.gold += target.kind === 'boss' ? 35 : 4 + state.floor
          while (player.xp >= player.xpNext) {
            player.xp -= player.xpNext
            player.level += 1
            player.xpNext = Math.round(player.xpNext * 1.45)
            player.maxHp += 8
            player.hp = player.maxHp
            player.attack += 2
            messages = addMessage(messages, `Level ${player.level}! Vitality and attack increased.`)
            state.flash = 'level'
          }
        }
        if (enemies.length === 0) messages = addMessage(messages, 'The seal breaks. The exit is open!')
        state = { ...state, player, enemies, messages }
        spentTurn = true
      }

      if (action === 'interact') {
        if (state.enemies.length === 0 && directDistance(state.player, state.layout.exit) <= 1.6) {
          heldKeys.current.clear()
          if (state.floor === 6) {
            return { ...state, status: 'won', messages: addMessage(state.messages, 'The Void King is vanquished. Dawn returns!') }
          }
          return makeFloor(state.floor + 1, state.player)
        }
        const chest = state.chests.find((item) => !item.opened && directDistance(item, state.player) <= 1.3)
        if (!chest) {
          const message = state.enemies.length === 0
            ? 'Stand beside the glowing gate and press E.'
            : 'There is nothing nearby to inspect.'
          return { ...state, messages: addMessage(state.messages, message) }
        }
        const lootType = (chest.id + state.floor) % 3
        const lootName = lootType === 0 ? 'healing potion' : lootType === 1 ? 'power rune' : 'heart shard'
        const reward = 12 + state.floor * 3
        state = {
          ...state,
          chests: state.chests.map((item) => item.id === chest.id ? { ...item, opened: true } : item),
          player: {
            ...state.player,
            gold: state.player.gold + reward,
            potions: state.player.potions + (lootType === 0 ? 1 : 0),
            runes: (state.player.runes ?? 0) + (lootType === 1 ? 1 : 0),
            shards: (state.player.shards ?? 0) + (lootType === 2 ? 1 : 0),
          },
          messages: addMessage(state.messages, `Chest opened: ${reward} gold and a ${lootName}.`),
        }
        spentTurn = true
      }

      if (!spentTurn) return state
      return { ...state, turn: state.turn + 1 }
    })
  }, [])

  useEffect(() => {
    const movementKeys = new Set(['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd', 'shift'])
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (upgradeOpenRef.current) {
        if (key === 'escape' || key === 'e') {
          event.preventDefault()
          upgradeOpenRef.current = false
          setUpgradeOpen(false)
        }
        return
      }
      if (movementKeys.has(key)) {
        event.preventDefault()
        heldKeys.current.add(key)
        return
      }
      if (event.repeat) return
      if (event.key === ' ') { event.preventDefault(); takeAction('attack') }
      if (key === 'e') takeAction('interact')
      if (key === 'q') takeAction('potion')
    }
    const onKeyUp = (event: KeyboardEvent) => heldKeys.current.delete(event.key.toLowerCase())
    const clearKeys = () => heldKeys.current.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearKeys)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
    }
  }, [takeAction])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== 'playing' || upgradeOpenRef.current) return current
        const layout = current.layout ?? makeLayout(current.floor)
        const keys = heldKeys.current
        let dx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0)
        let dy = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0)
        if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2 }

        let player = { ...current.player }
        if (!Number.isFinite(player.sprint)) player.sprint = SPRINT_MAX
        player.sprint = Math.min(player.sprint, SPRINT_MAX)
        player.attackCooldown = Math.max(0, (player.attackCooldown ?? 0) - 0.034)
        const isMoving = dx !== 0 || dy !== 0
        const isSprinting = keys.has('shift') && isMoving && player.sprint > 0
        const baseSpeed = 0.13 + (player.speedUpgrades ?? 0) * 0.012
        const speed = isSprinting ? baseSpeed + 0.1 : baseSpeed
        player.sprint = isSprinting
          ? Math.max(0, player.sprint - 0.033)
          : Math.min(SPRINT_MAX, player.sprint + 0.012)
        if (dx) {
          const nextX = { x: player.x + dx * speed, y: player.y }
          if (canStandAt(nextX, layout)) player.x = nextX.x
        }
        if (dy) {
          const nextY = { x: player.x, y: player.y + dy * speed }
          if (canStandAt(nextY, layout)) player.y = nextY.y
        }

        let hp = player.hp
        let messages = current.messages
        let wasHit = false
        let attackerId = current.attackerId ?? null
        const detectionRange = 5.75
        const enemySpeed = 0.056 + current.floor * 0.002
        let enemies = current.enemies.map((enemy) => {
          const range = directDistance(enemy, player)
          if (enemy.kind === 'boss') {
            if (range < 1.35 && current.turn % 15 === 0) {
              hp -= enemy.attack
              wasHit = true
              attackerId = enemy.id
              messages = addMessage(messages, `${enemy.name}'s aura burns for ${enemy.attack} damage.`)
            }
            return enemy
          }
          if (range > detectionRange) return enemy
          if (range < 0.72) {
            if (current.turn % 15 === 0) {
              hp -= enemy.attack
              wasHit = true
              attackerId = enemy.id
              messages = addMessage(messages, `${enemy.name} strikes for ${enemy.attack} damage.`)
            }
            return enemy
          }

          const vx = (player.x - enemy.x) / range * enemySpeed
          const vy = (player.y - enemy.y) / range * enemySpeed
          let moved = enemy
          const nextX = { ...moved, x: moved.x + vx }
          if (canStandAt(nextX, layout, 0.25)) moved = nextX
          const nextY = { ...moved, y: moved.y + vy }
          if (canStandAt(nextY, layout, 0.25)) moved = nextY
          return moved
        })

        let hazards = (current.hazards ?? []).filter((hazard) => current.turn - hazard.createdTurn < hazard.delay + 20)
        hazards.forEach((hazard) => {
          const age = current.turn - hazard.createdTurn
          if (age === hazard.delay && directDistance(hazard, player) < 0.82) {
            const damage = 6 + current.floor
            hp -= damage
            wasHit = true
            messages = addMessage(messages, `A void spike erupts for ${damage} damage.`)
          }
        })

        const boss = enemies.find((enemy) => enemy.kind === 'boss')
        const bossPhase = current.turn % BOSS_CYCLE
        if (boss && bossPhase === 1) {
          const waveNumber = Math.floor(current.turn / BOSS_CYCLE)
          if (waveNumber % 2 === 0) {
            const wave: Hazard[] = []
            for (let y = 2; y < layout.height - 2; y += 1) {
              for (let x = 2; x < layout.width - 2; x += 1) {
                if ((x + y + current.floor) % 4 === 0 && !isWall({ x, y }, layout)) {
                  wave.push({
                    id: current.floor * 100000 + current.turn * 100 + y * layout.width + x,
                    x,
                    y,
                    createdTurn: current.turn,
                    delay: 12 + Math.round(directDistance(boss, { x, y }) * 2.4),
                  })
                }
              }
            }
            hazards = [...hazards, ...wave]
            messages = addMessage(messages, `${boss.name} calls a wave of void spikes!`)
          } else if (enemies.length < 7) {
            const summons: Enemy[] = [
              { x: boss.x - 2, y: boss.y + 1, kind: 'skeleton' },
              { x: boss.x - 1, y: boss.y + 3, kind: 'bat' },
            ].map((summon, index) => {
              const maxHp = 16 + current.floor * 5
              return {
                ...summon,
                id: current.floor * 100000 + current.turn * 10 + index,
                hp: maxHp,
                maxHp,
                attack: 4 + current.floor,
                xp: 8 + current.floor,
                name: summon.kind === 'bat' ? 'Void Bat' : 'Ash Skeleton',
              }
            })
            enemies = [...enemies, ...summons]
            messages = addMessage(messages, `${boss.name} summons reinforcements!`)
          }
        }

        if (hp <= 0) {
          heldKeys.current.clear()
          return { ...current, turn: current.turn + 1, enemies, hazards, player: { ...player, hp: 0 }, messages: addMessage(messages, 'Your light fades in the dungeon...'), status: 'dead', flash: 'hurt', attackerId }
        }
        return {
          ...current,
          layout,
          turn: current.turn + 1,
          enemies,
          hazards,
          player: { ...player, hp },
          messages,
          flash: wasHit ? 'hurt' : current.flash,
          attackerId,
        }
      })
    }, 33)
    return () => window.clearInterval(timer)
  }, [])

  const holdDirection = (direction: 'up' | 'down' | 'left' | 'right', pressed: boolean) => {
    const key = `arrow${direction}`
    if (pressed) heldKeys.current.add(key)
    else heldKeys.current.delete(key)
  }

  const closeUpgrades = () => {
    upgradeOpenRef.current = false
    setUpgradeOpen(false)
  }

  const buyUpgrade = (kind: 'speed' | 'damage' | 'health') => {
    setGame((current) => {
      const levelKey = `${kind}Upgrades` as 'speedUpgrades' | 'damageUpgrades' | 'healthUpgrades'
      const level = current.player[levelKey] ?? 0
      const cost = 20 + level * 20
      if (current.player.gold < cost) {
        return { ...current, messages: addMessage(current.messages, `The Forge demands ${cost} gold.`) }
      }
      const player = { ...current.player, gold: current.player.gold - cost, [levelKey]: level + 1 }
      if (kind === 'damage') player.attack += 1
      if (kind === 'health') {
        player.maxHp += 6
        player.hp = Math.min(player.maxHp, player.hp + 6)
      }
      return {
        ...current,
        player,
        flash: 'level',
        messages: addMessage(current.messages, `${kind[0].toUpperCase()}${kind.slice(1)} upgraded to rank ${level + 1}.`),
      }
    })
  }

  useEffect(() => {
    if (!game.flash) return
    const timer = window.setTimeout(() => setGame((state) => ({ ...state, flash: null, attackerId: null })), game.flash === 'attack' ? 180 : 350)
    return () => window.clearTimeout(timer)
  }, [game.flash, game.status])

  const tiles = useMemo(
    () => Array.from({ length: layout.width * layout.height }, (_, i) => ({ x: i % layout.width, y: Math.floor(i / layout.width) })),
    [layout.height, layout.width],
  )
  const hpPercent = Math.max(0, (game.player.hp / game.player.maxHp) * 100)
  const xpPercent = (game.player.xp / game.player.xpNext) * 100
  const sprintRemaining = Number.isFinite(game.player.sprint) ? Math.min(game.player.sprint, SPRINT_MAX) : SPRINT_MAX
  const attackReadyPercent = Math.max(0, 100 - ((game.player.attackCooldown ?? 0) / ATTACK_COOLDOWN) * 100)
  const bossVulnerable = boss ? bossIsVulnerable(game.turn) : false
  const inventoryItems = [
    { name: 'HEALING POTION', detail: 'RESTORE UP TO 18 HP', count: game.player.potions, icon: 'flask' as const, action: 'potion' as const },
    { name: 'POWER RUNE', detail: 'PERMANENT +1 ATTACK', count: game.player.runes ?? 0, icon: 'sword' as const, action: 'rune' as const },
    { name: 'HEART SHARD', detail: 'PERMANENT +5 MAX HP', count: game.player.shards ?? 0, icon: 'heart' as const, action: 'shard' as const },
  ]
  const activeItem = inventoryItems[selectedItem]

  return (
    <main className={`game-shell ${game.flash === 'hurt' ? 'hurt-flash' : ''} ${game.flash === 'level' ? 'level-flash' : ''} ${game.flash === 'attack' ? 'attack-flash' : ''}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><span /></span>
          <div><h1>DEEP<span>DELVE</span></h1><p>THE PIXEL DUNGEON</p></div>
        </div>
        <div className="floor-chip"><small>DEPTH</small><strong>{String(game.floor).padStart(2, '0')} <span>/ 06</span></strong></div>
      </header>

      <section className="game-layout">
        <aside className="panel hero-panel">
          <div className="panel-label">DELVER</div>
          <div className="portrait"><div className="knight portrait-knight"><i /><b /><em /></div><span>LVL {game.player.level}</span></div>
          <h2>THE LAST LIGHT</h2>
          <p className="class-name">IRONBOUND</p>

          <div className="meter-block">
            <div className="meter-title"><span><Icon name="heart" size={14} /> VITALITY</span><b>{game.player.hp} / {game.player.maxHp}</b></div>
            <div className="meter health"><i style={{ width: `${hpPercent}%` }} /></div>
          </div>
          <div className="meter-block">
            <div className="meter-title"><span><Icon name="bolt" size={14} /> EXPERIENCE</span><b>{game.player.xp} / {game.player.xpNext}</b></div>
            <div className="meter xp"><i style={{ width: `${xpPercent}%` }} /></div>
          </div>
          <div className="meter-block sprint-block">
            <div className="meter-title"><span>SPRINT</span><b>SHIFT · {sprintRemaining.toFixed(2)}s</b></div>
            <div className="meter sprint"><i style={{ width: `${(sprintRemaining / SPRINT_MAX) * 100}%` }} /></div>
          </div>
          <div className="meter-block attack-cooldown-block">
            <div className="meter-title"><span><Icon name="sword" size={13} /> STRIKE</span><b>{attackReadyPercent >= 100 ? 'READY' : 'RECOVER'}</b></div>
            <div className="meter attack-cooldown"><i style={{ width: `${attackReadyPercent}%` }} /></div>
          </div>

          <div className="stats-grid">
            <div><Icon name="sword" /><span>ATTACK<b>{game.player.attack}</b></span></div>
            <div><Icon name="coin" /><span>GOLD<b>{game.player.gold}</b></span></div>
          </div>
          <div className="item-carousel">
            <button className="item-arrow" aria-label="Previous inventory item" onClick={() => setSelectedItem((item) => (item + inventoryItems.length - 1) % inventoryItems.length)}>‹</button>
            <button className="potion-btn item-use-btn" onClick={() => takeAction(activeItem.action)}>
              <Icon name={activeItem.icon} /><span>{activeItem.name}<small>{activeItem.detail}</small></span><b>{activeItem.count}</b>
            </button>
            <button className="item-arrow" aria-label="Next inventory item" onClick={() => setSelectedItem((item) => (item + 1) % inventoryItems.length)}>›</button>
            <div className="item-dots">
              {inventoryItems.map((item, index) => <i key={item.name} className={selectedItem === index ? 'active' : ''} />)}
            </div>
          </div>
        </aside>

        <section className="dungeon-wrap">
          <div className="dungeon-header">
            <div><small>FLOOR {game.floor} · {layout.width}×{layout.height}</small><h2>{game.floor % 3 === 0 ? 'THRONE OF ASH' : layout.name}</h2></div>
            <div className={`objective ${cleared ? 'done' : ''}`}><i />{cleared ? 'GATE OPEN' : `${game.enemies.length} FOES REMAIN`}</div>
          </div>

          <div className="dungeon-frame">
            <div
              className="dungeon-grid"
              style={{
                '--cols': layout.width,
                '--rows': layout.height,
                aspectRatio: `${layout.width} / ${layout.height}`,
              } as React.CSSProperties}
            >
              {tiles.map((tile) => (
                <div key={`${tile.x}-${tile.y}`} className={`tile ${isWall(tile, layout) ? 'wall' : 'floor'} ${same(tile, layout.exit) ? (cleared ? 'exit open' : 'exit') : ''}`}>
                  {same(tile, layout.exit) && <div className="gate"><i /><i /><i /></div>}
                </div>
              ))}
              {game.chests.map((chest) => (
                <div key={chest.id} className={`entity chest ${chest.opened ? 'opened' : ''}`} style={{ '--x': chest.x, '--y': chest.y } as React.CSSProperties}><i /><b /></div>
              ))}
              <div className="entity upgrade-table" style={{ '--x': layout.table.x, '--y': layout.table.y } as React.CSSProperties}>
                <div className="table-top"><i /><b /><em /></div>
              </div>
              {(game.hazards ?? []).map((hazard) => {
                const age = game.turn - hazard.createdTurn
                const active = age >= hazard.delay
                return (
                  <div key={hazard.id} className={`entity void-spike ${active ? 'active' : 'warning'}`} style={{ '--x': hazard.x, '--y': hazard.y } as React.CSSProperties}>
                    <i /><b /><em />
                  </div>
                )
              })}
              {game.enemies.map((enemy) => (
                <div
                  key={enemy.id}
                  className={`entity enemy ${enemy.kind} ${game.attackerId === enemy.id ? 'striking' : ''} ${enemy.kind === 'boss' && !bossVulnerable ? 'shielded' : ''}`}
                  style={{
                    '--x': enemy.x,
                    '--y': enemy.y,
                    '--attack-x': `${Math.sign(game.player.x - enemy.x) * 10}px`,
                    '--attack-y': `${Math.sign(game.player.y - enemy.y) * 8}px`,
                  } as React.CSSProperties}
                >
                  <div className="enemy-hp"><i style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} /></div>
                  <div className="sprite"><i /><b /><em /><span /></div>
                  <div className="attack-effect"><i /><b /><em /></div>
                </div>
              ))}
              <div className="entity player" style={{ '--x': game.player.x, '--y': game.player.y } as React.CSSProperties}>
                <div className="knight"><i /><b /><em /></div>
              </div>
            </div>
            {game.status !== 'playing' && (
              <div className="end-screen">
                <small>{game.status === 'won' ? 'DUNGEON CONQUERED' : 'THE DELVE ENDS'}</small>
                <h2>{game.status === 'won' ? 'LIGHT RESTORED' : 'YOU HAVE FALLEN'}</h2>
                <p>{game.status === 'won' ? `You escaped with ${game.player.gold} gold at level ${game.player.level}.` : `You reached floor ${game.floor}. Rise and try again.`}</p>
                <button onClick={() => setGame(makeFloor(1))}>BEGIN A NEW DELVE</button>
              </div>
            )}
          </div>

          {boss && <div className={`boss-bar ${bossVulnerable ? 'vulnerable' : 'casting'}`}><span>{bossVulnerable ? 'OPEN' : 'WAVE'}</span><div><b>{boss.name} · {bossVulnerable ? 'VULNERABLE' : 'SHIELDED'}</b><i><em style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} /></i></div><strong>{boss.hp}</strong></div>}

          <div className="mobile-actions">
            <div className="dpad">
              {(['up', 'left', 'down', 'right'] as const).map((direction) => (
                <button
                  key={direction}
                  className={direction}
                  aria-label={`Move ${direction}`}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdDirection(direction, true) }}
                  onPointerUp={() => holdDirection(direction, false)}
                  onPointerCancel={() => holdDirection(direction, false)}
                >{{ up: '▲', left: '◀', down: '▼', right: '▶' }[direction]}</button>
              ))}
            </div>
            <button className="action-btn attack-btn" onClick={() => takeAction('attack')}><Icon name="sword" /><span>STRIKE<small>SPACE</small></span></button>
            <button className="action-btn" onClick={() => takeAction('interact')}><span>OPEN<small>E</small></span></button>
          </div>
        </section>

        <aside className="panel log-panel">
          <div className="panel-label">DELVE LOG</div>
          <div className="quest-card">
            <small>CURRENT OBJECTIVE</small>
            <h3>{cleared ? 'REACH THE GATE' : game.floor % 3 === 0 ? 'SLAY THE WARDEN' : 'BREAK THE SEAL'}</h3>
            <p>{cleared ? 'Stand at the gate and press E.' : boss ? (bossVulnerable ? 'The shield is down. Strike now!' : 'Survive the wave until its shield falls.') : 'Defeat all enemies on this floor.'}</p>
            <div><i style={{ width: cleared ? '100%' : `${Math.max(8, 100 - (game.enemies.length / (game.floor % 3 === 0 ? Math.min(3, game.floor) : Math.min(3 + game.floor, 7))) * 100)}%` }} /></div>
          </div>
          <div className="messages">
            {game.messages.map((message, i) => <p key={`${message}-${i}`} className={i === 0 ? 'active' : ''}><i />{message}</p>)}
          </div>
          <div className="controls">
            <small>CONTROLS</small>
            <div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><span><kbd>Q</kbd> POTION</span></div>
            <div><span><kbd>SPACE</kbd> STRIKE</span><span><kbd>E</kbd> OPEN</span></div>
            <div><span><kbd>SHIFT</kbd> SPRINT</span><span>0.65 SEC</span></div>
            <p className="range-note">FOES AWAKEN WITHIN 5 TILES</p>
          </div>
        </aside>
      </section>

      {upgradeOpen && (
        <div className="upgrade-overlay" role="dialog" aria-modal="true" aria-label="Forge upgrades">
          <div className="upgrade-page">
            <button className="upgrade-close" onClick={closeUpgrades} aria-label="Close upgrades">×</button>
            <small>ANCIENT FORGE</small>
            <h2>UPGRADE TABLE</h2>
            <p>Temper your strength. Every rank costs more than the last.</p>
            <div className="upgrade-gold"><Icon name="coin" /><span>AVAILABLE GOLD</span><b>{game.player.gold}</b></div>
            <div className="upgrade-list">
              {([
                { kind: 'speed' as const, title: 'SWIFTSTEP', detail: 'Increase movement speed', icon: 'bolt' as const, level: game.player.speedUpgrades ?? 0 },
                { kind: 'damage' as const, title: 'SHARPEN BLADE', detail: 'Increase attack by 1', icon: 'sword' as const, level: game.player.damageUpgrades ?? 0 },
                { kind: 'health' as const, title: 'IRON HEART', detail: 'Increase maximum HP by 6', icon: 'heart' as const, level: game.player.healthUpgrades ?? 0 },
              ]).map((upgrade) => {
                const cost = 20 + upgrade.level * 20
                return (
                  <div className="upgrade-row" key={upgrade.kind}>
                    <span className="upgrade-icon"><Icon name={upgrade.icon} size={22} /></span>
                    <div><h3>{upgrade.title}</h3><p>{upgrade.detail}</p><small>RANK {upgrade.level}</small></div>
                    <button disabled={game.player.gold < cost} onClick={() => buyUpgrade(upgrade.kind)}><Icon name="coin" size={13} /> {cost}</button>
                  </div>
                )
              })}
            </div>
            <div className="upgrade-hint">PRESS E OR ESC TO RETURN TO THE DUNGEON</div>
          </div>
        </div>
      )}

      <footer><span>THE LIGHT GROWS DIMMER WITH EVERY STEP</span><i /><span>DEFEAT THE VOID KING ON FLOOR 06</span></footer>
    </main>
  )
}
