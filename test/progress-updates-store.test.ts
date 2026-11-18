import { describe, expect, it } from 'vitest'
import {
  MAX_UPDATES,
  NUDGE_MIN_INTERVAL_MS,
  NUDGE_THRESHOLD,
  capUpdates,
  createProgressUpdateStore,
  nextUpdateId,
  shouldNudge,
  shouldNudgeTimed,
} from '../src/host/progress-updates/store.ts'
import type { ProgressUpdate } from '../src/host/progress-updates/store.ts'

/** 造一条进展，只需要 id 唯一就够测环形缓冲。 */
function update(index: number): ProgressUpdate {
  return { id: `u${index}`, message: `message ${index}`, at: 1_000 + index }
}

describe('capUpdates', () => {
  it('短列表原样返回（且不是同一个数组实例）', () => {
    const input = [update(1), update(2)]
    const capped = capUpdates(input)
    expect(capped).toEqual(input)
    expect(capped).not.toBe(input)
  })

  it('达到上限时原样保留', () => {
    const input = Array.from({ length: MAX_UPDATES }, (_, index) => update(index))
    expect(capUpdates(input)).toHaveLength(MAX_UPDATES)
  })

  it('超出上限时丢弃最旧的，只留最新的 MAX_UPDATES 条', () => {
    const input = Array.from({ length: MAX_UPDATES + 12 }, (_, index) => update(index))
    const capped = capUpdates(input)
    expect(capped).toHaveLength(MAX_UPDATES)
    // 保留的是尾部：第一条是被丢到只剩最后 MAX_UPDATES 条之后的那一条。
    expect(capped[0]?.id).toBe(`u${12}`)
    expect(capped[capped.length - 1]?.id).toBe(`u${MAX_UPDATES + 11}`)
  })

  it('不就地修改入参', () => {
    const input = Array.from({ length: MAX_UPDATES + 3 }, (_, index) => update(index))
    const before = input.length
    capUpdates(input)
    expect(input).toHaveLength(before)
  })
})

describe('shouldNudge', () => {
  it('阈值是 8', () => {
    expect(NUDGE_THRESHOLD).toBe(8)
  })

  it('低于阈值不催促', () => {
    for (let rounds = 0; rounds < NUDGE_THRESHOLD; rounds += 1) {
      expect(shouldNudge(rounds), String(rounds)).toBe(false)
    }
  })

  it('达到与超过阈值都催促', () => {
    expect(shouldNudge(NUDGE_THRESHOLD)).toBe(true)
    expect(shouldNudge(NUDGE_THRESHOLD + 100)).toBe(true)
  })

  it('设置值覆盖默认阈值时按设置值判定', () => {
    expect(shouldNudge(2, 3)).toBe(false)
    expect(shouldNudge(3, 3)).toBe(true)
    expect(shouldNudge(4, 3)).toBe(true)
  })
})

describe('shouldNudgeTimed', () => {
  const at = 1_700_000_000_000

  it('轮次够了但时间没到：不催', () => {
    expect(shouldNudgeTimed({ roundsSinceUpdate: NUDGE_THRESHOLD, lastProgressAt: at }, NUDGE_THRESHOLD, at)).toBe(false)
    expect(shouldNudgeTimed({ roundsSinceUpdate: NUDGE_THRESHOLD * 3, lastProgressAt: at }, NUDGE_THRESHOLD, at + NUDGE_MIN_INTERVAL_MS - 1)).toBe(false)
  })

  it('两个条件都满足才催', () => {
    expect(shouldNudgeTimed({ roundsSinceUpdate: NUDGE_THRESHOLD, lastProgressAt: at }, NUDGE_THRESHOLD, at + NUDGE_MIN_INTERVAL_MS)).toBe(true)
    // 时间够了但轮次不够：不催。
    expect(shouldNudgeTimed({ roundsSinceUpdate: NUDGE_THRESHOLD - 1, lastProgressAt: at }, NUDGE_THRESHOLD, at + NUDGE_MIN_INTERVAL_MS * 10)).toBe(false)
  })

  it('时间下限默认 3 分钟，可被显式参数覆盖', () => {
    expect(NUDGE_MIN_INTERVAL_MS).toBe(3 * 60 * 1000)
    expect(shouldNudgeTimed({ roundsSinceUpdate: 1, lastProgressAt: at }, 1, at + 60_000)).toBe(false)
    expect(shouldNudgeTimed({ roundsSinceUpdate: 1, lastProgressAt: at }, 1, at + 60_000, 60_000)).toBe(true)
  })

  it('时钟回拨不会被静音：差值为负按「等够了」处理', () => {
    expect(shouldNudgeTimed({ roundsSinceUpdate: 1, lastProgressAt: at }, 1, at - 60_000)).toBe(true)
  })
})

describe('createProgressUpdateStore', () => {
  it('初始状态为空且计数归零，上次进展时刻取创建时刻', () => {
    expect(createProgressUpdateStore(1_700_000_000_000).state()).toEqual({
      updates: [],
      roundsSinceUpdate: 0,
      nudges: 0,
      lastProgressAt: 1_700_000_000_000,
    })
  })

  it('push 追加进展并按环形缓冲截断', () => {
    const store = createProgressUpdateStore()
    for (let index = 0; index < MAX_UPDATES + 5; index += 1) store.push(update(index))
    const state = store.state()
    expect(state.updates).toHaveLength(MAX_UPDATES)
    expect(state.updates[0]?.id).toBe(`u${5}`)
    expect(state.updates[MAX_UPDATES - 1]?.id).toBe(`u${MAX_UPDATES + 4}`)
  })

  it('bumpRound 累加轮次，markUpdated 归零并把时间下限重新起算', () => {
    const store = createProgressUpdateStore(1_000)
    expect(store.bumpRound()).toBe(1)
    expect(store.bumpRound()).toBe(2)
    expect(store.state().roundsSinceUpdate).toBe(2)
    store.markUpdated(5_000)
    expect(store.state().roundsSinceUpdate).toBe(0)
    expect(store.state().lastProgressAt).toBe(5_000)
  })

  it('markNudged 归零轮次、累加催促次数，并重置时间下限', () => {
    const store = createProgressUpdateStore(1_000)
    for (let index = 0; index < NUDGE_THRESHOLD; index += 1) store.bumpRound()
    expect(shouldNudge(store.state().roundsSinceUpdate)).toBe(true)
    store.markNudged(9_000)
    expect(store.state().roundsSinceUpdate).toBe(0)
    expect(store.state().nudges).toBe(1)
    expect(store.state().lastProgressAt).toBe(9_000)
    store.markNudged()
    expect(store.state().nudges).toBe(2)
  })

  it('归零之后要重新攒满阈值才会再次催促', () => {
    const store = createProgressUpdateStore()
    for (let index = 0; index < NUDGE_THRESHOLD; index += 1) store.bumpRound()
    store.markNudged()
    for (let index = 0; index < NUDGE_THRESHOLD - 1; index += 1) {
      expect(shouldNudge(store.bumpRound())).toBe(false)
    }
    expect(shouldNudge(store.bumpRound())).toBe(true)
  })

})

describe('nextUpdateId', () => {
  it('同一毫秒内也保持唯一', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nextUpdateId(1_700_000_000_000)))
    expect(ids.size).toBe(100)
  })

  it('带上时间戳前缀，便于人工辨认', () => {
    expect(nextUpdateId(1_700_000_000_000)).toMatch(/^pu-1700000000000-\d+$/)
  })
})
