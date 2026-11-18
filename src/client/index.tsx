/**
 * 浏览器半边入口。派生自原核心行 `src/client/index.tsx` 中与进展更新相关的那几行：
 * 注册词典、安装样式表、挂面板与设置分区。独立成包后，这里是唯一的客户端入口。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 下面这些 `import type {}` 只为把宿主客户端的 Context 增强拉进程序；缺了它们，
// TS 会报「Property 'slots' does not exist on type 'Context'」（TS2339）。
// 注意它们与下面的 inject **不是**一回事：这里只是类型面，不申请任何服务。
// - renderer：`ctx.slots` 的声明在它那里（ui-slots 只有槽位契约本身）；
// - ui-settings / ui-tool：`settings.section` / `tool.call.toolview` 两个槽位的声明。
// 原核心入口还引了 conversation / model-selection 两条，那是订阅服务线路要的，
// 本插件一个槽位都没用，拆包时已去掉。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { installProgressUpdatesClient } from './progress-updates/index.ts'
import { dictionaries, NS_PROGRESS_UPDATES } from './progress-updates/locales.ts'
import { installProgressUpdatesStyles } from './progress-updates/styles.ts'

/**
 * 只申请真正用到的两个服务。
 *
 * 原核心客户端入口申请了七个（多出 modelDirectories / conversation / sessions /
 * remote / remote.session），那是订阅服务线路的需要：本插件的客户端代码对后五个
 * 是零引用，而写进 inject 就等于把「这套部署必须装着它们」变成硬前提。其余可选
 * 服务（configForms、sidebarRight、sidebarRightTabs）一律走 `get()` 按在不在处理。
 */
export const inject = [
  'slots',
  'locale',
]

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS_PROGRESS_UPDATES, dictionaries), 'dsh-progress-updates: dictionaries')
  ctx.effect(() => {
    installProgressUpdatesStyles()
    return () => {}
  }, 'dsh-progress-updates: styles')
  installProgressUpdatesClient(ctx)
}
