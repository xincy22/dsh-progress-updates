/**
 * 进展更新的会话维度状态 —— 纯逻辑。
 *
 * 这里刻意不 import 任何 `node:` 内置模块，也不 import 任何 `@deepseek-ai` 运行时
 * 服务：同一份实现既要在宿主进程里维护推进节奏（轮次计数、催促次数），也可能被
 * 浏览器半边复用做渲染推导，任何一端专属的依赖都会让另一端无法装载。
 *
 * @module dsh-progress-updates/host/progress-updates/store
 */

/** 环形缓冲上限：最多保留的进展条数。 */
export const MAX_UPDATES = 50

/** 催促阈值：连续这么多轮带工具调用却没有进展更新时，注入一条提醒。 */
export const NUDGE_THRESHOLD = 8

/**
 * 催促的时间下限：距离上次进展（或上次催促）不足这么久就不打扰。
 *
 * 只按轮次计数会把「连续读十个文件」算成十轮：那十轮里模型确实没有新进展可报，
 * 催一次只是噪声。加上时间下限，快节奏的连续工具调用不会触发，真正拖了几分钟的
 * 那种停顿才会。两个条件**同时**满足才催（轮次证明干了活，时间证明用户等久了）。
 */
export const NUDGE_MIN_INTERVAL_MS = 3 * 60 * 1000

/** 一条已展示的进展。 */
export interface ProgressUpdate {
  /** 稳定标识，同一会话内唯一（进程内自增 + 时间戳，无外部依赖）。 */
  id: string
  /** 单行标题，约 60 字以内，用户语言，纯文本，无 Markdown，无结尾句号。 */
  title?: string
  /** 详情正文，约 1000 字以内，轻 Markdown：一段正文 + 少量 bullet。 */
  message: string
  /** 产生时刻，Unix 毫秒时间戳。 */
  at: number
}

/** 一个会话维度的进展更新状态。 */
export interface ProgressUpdateState {
  /** 进展环形缓冲，按产生顺序排列，最多 {@link MAX_UPDATES} 条。 */
  updates: ProgressUpdate[]
  /** 自上次进展更新以来连续带工具调用的轮次数。 */
  roundsSinceUpdate: number
  /** 本会话已经发出的催促次数。 */
  nudges: number
  /** 上一次进展（或上一次催促）的时刻，Unix 毫秒；催促的时间下限按它算。 */
  lastProgressAt: number
}

/**
 * 判断是否该催促。达到阈值即触发，注入之后调用方把计数清零。
 * @param rounds - 自上次进展更新以来的连续轮次数。
 * @returns 是否达到 {@link NUDGE_THRESHOLD}。
 */
export function shouldNudge(rounds: number, threshold: number = NUDGE_THRESHOLD): boolean {
  return rounds >= threshold
}

/**
 * 催促的完整判据：轮次够了，并且距离上次进展/催促已经超过时间下限。
 * @param state - 会话状态（读轮次与上次进展时刻）。
 * @param threshold - 催促阈值（轮次）。
 * @param now - 当前时刻，Unix 毫秒。
 * @param minIntervalMs - 时间下限，缺省 {@link NUDGE_MIN_INTERVAL_MS}。
 * @returns 是否该催促。
 */
export function shouldNudgeTimed(
  state: Pick<ProgressUpdateState, 'roundsSinceUpdate' | 'lastProgressAt'>,
  threshold: number = NUDGE_THRESHOLD,
  now: number = Date.now(),
  minIntervalMs: number = NUDGE_MIN_INTERVAL_MS,
): boolean {
  if (!shouldNudge(state.roundsSinceUpdate, threshold)) return false
  // 时钟回拨（或状态里落着一个未来时刻）会让差值为负：那时按「等够了」处理，
  // 否则一次时区/时钟抖动就能把催促永久静音。
  const elapsed = now - state.lastProgressAt
  return !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= minIntervalMs
}

/**
 * 把进展列表截断到环形缓冲上限，保留最新的一批。
 * @param list - 任意长度的进展列表（不会被就地修改）。
 * @returns 截断后的新数组。
 */
export function capUpdates(list: readonly ProgressUpdate[]): ProgressUpdate[] {
  return list.length <= MAX_UPDATES ? [...list] : list.slice(list.length - MAX_UPDATES)
}

/** 进程内自增序号，只用于拼出稳定 id；不含任何运行时依赖。 */
let sequence = 0

/**
 * 生成一条进展的稳定 id。
 * @param at - 产生时刻（Unix 毫秒）。
 * @returns 形如 `pu-<时间戳>-<序号>` 的字符串。
 */
export function nextUpdateId(at: number): string {
  sequence += 1
  return `pu-${at}-${sequence}`
}

/** 会话维度状态容器：宿主持有它推进计数，路由只读它渲染。 */
export interface ProgressUpdateStore {
  /** 读取当前状态（快照语义，返回的是引用，调用方不要就地改）。 */
  state(): ProgressUpdateState
  /** 追加一条进展；超出 {@link MAX_UPDATES} 时丢弃最旧的。 */
  push(update: ProgressUpdate): ProgressUpdateState
  /** 记一轮「带工具调用」的轮次，返回新的轮次数。 */
  bumpRound(): number
  /** 记录一次进展更新：轮次计数归零，并把「上次进展时刻」推到此刻。 */
  markUpdated(now?: number): ProgressUpdateState
  /** 记录一次催促：催促次数 +1，轮次计数归零，时间下限从此刻重新起算。 */
  markNudged(now?: number): ProgressUpdateState
}

/**
 * 创建一个空的进展更新 store。
 *
 * 初始的「上次进展时刻」取创建时刻：会话刚起来就连续跑工具时，时间下限同样生效，
 * 不会因为「从没报过进展」而被当成等了无限久。
 * @param now - 创建时刻，Unix 毫秒；测试可注入。
 * @returns 新的会话维度 store。
 */
export function createProgressUpdateStore(now: number = Date.now()): ProgressUpdateStore {
  let current: ProgressUpdateState = { updates: [], roundsSinceUpdate: 0, nudges: 0, lastProgressAt: now }

  return {
    state: () => current,
    push: (update) => {
      current = { ...current, updates: capUpdates([...current.updates, update]) }
      return current
    },
    bumpRound: () => {
      current = { ...current, roundsSinceUpdate: current.roundsSinceUpdate + 1 }
      return current.roundsSinceUpdate
    },
    markUpdated: (at = Date.now()) => {
      current = { ...current, roundsSinceUpdate: 0, lastProgressAt: at }
      return current
    },
    markNudged: (at = Date.now()) => {
      current = { ...current, roundsSinceUpdate: 0, nudges: current.nudges + 1, lastProgressAt: at }
      return current
    },
  }
}
