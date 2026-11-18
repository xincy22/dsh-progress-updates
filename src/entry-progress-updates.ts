/**
 * 「进展更新」的宿主入口：独立成一行的 loader 条目。
 *
 * 派生自 `@eddyskywalker/dsh-chatgpt-subscription` 0.71.0。原版里这三个设置字段挂在核心
 * 行上，靠 `attachProgressSettings` 递交过来；独立成包后核心行不存在，字段改由本入口
 * 自己声明（{@link Config}），apply 直接读它自己的 config。
 *
 * 为什么字段仍是 `volatile()`：设置面板保存时直接提交进正在运行的实例，不需要重挂整行。
 * 读取靠 {@link resolveProgressUpdatesSettings}，它每次调用都重读活引用。
 *
 * @module dsh-progress-updates/entry-progress-updates
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  installProgressUpdates,
  resolveProgressUpdatesSettings,
  type ProgressUpdatesContext,
} from './host/progress-updates/index.ts'
import { NUDGE_THRESHOLD } from './host/progress-updates/store.ts'

/** Loader 行名。patch 里的行 id 由 bundle 决定，与这里无关。 */
export const name = 'dsh-progress-updates'

/**
 * 不为任何服务等待。
 *
 * `installProgressUpdates` 逐个用 `ctx.get()` 探可选服务（tools、systemPrompt、
 * sessions、sessionProjections、webServer），缺哪个就退化成更弱的实现。把它们写进
 * `inject` 会让没装 agent-loop 的宿主整行挂不上。
 */
export const inject: string[] = []

/**
 * 四个设置字段：前三个的名字与默认值与原版核心行一致，`progressUpdatesNudge` 是
 * 本包新增的催促开关（原版只能把阈值调到 50 假装关掉）。
 *
 * 字段名保留 `progressUpdates*` 前缀：{@link resolveProgressUpdatesSettings} 与设置卡
 * 按这些键取值，改名就会静默失效。
 */
export const Config = z.object({
  progressUpdates: z.boolean().default(true).volatile()
    .description('启用进展更新：允许 agent 用 progress_update 工具主动汇报多步任务的进展，并在侧栏展示。'),
  progressUpdatesNudge: z.boolean().default(true).volatile()
    .description('催促提醒：连续多轮且超过 3 分钟没有进展时，提醒 agent 汇报一次；关闭后只保留工具与提示词引导。'),
  progressUpdatesNudgeThreshold: z.number().step(1).min(1).max(50).default(NUDGE_THRESHOLD).volatile()
    .description('催促阈值：连续这么多轮带工具调用却没有进展更新时，提醒 agent 发一条进展。'),
  progressUpdatesLanguage: z.union([z.const('auto'), z.const('zh'), z.const('en'), z.const('ru')])
    .default('auto').volatile()
    .description('进展更新的输出语言：auto 跟随对话语言，zh 中文，en 英文，ru 俄文。'),
})

/**
 * 挂载入口。
 *
 * `pluginConfig` 是本行自己的 config（含 volatile 活引用）。读取函数每次调用都重新解析，
 * 设置保存后下一次读取即生效。
 * @param ctx - loader 给的插件上下文。
 * @param pluginConfig - 本行的配置，缺省时取 schema 默认值。
 */
export function apply(ctx: Context, pluginConfig: Partial<Record<string, unknown>> = {}): void {
  const read = () => resolveProgressUpdatesSettings(pluginConfig as Parameters<typeof resolveProgressUpdatesSettings>[0])
  ctx.effect(
    () => installProgressUpdates(ctx as unknown as ProgressUpdatesContext, { settings: read }),
    'dsh-progress-updates: host half',
  )
}
