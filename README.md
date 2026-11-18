# dsh-progress-updates

DeepSeek Harness 的「进展更新」：`progress_update` 工具、系统提示词引导、连续若干轮工具调用未汇报时的催促、侧栏进展面板，以及设置分区。

派生自 `@eddyskywalker/dsh-chatgpt-subscription` 0.71.0 的 `src/host/progress-updates/`、`src/client/progress-updates/`、`src/entry-progress-updates.ts`（MIT，版权归原作者）。计数、步去重、清零、催促文案与阈值默认 8 保持原版。

## 安装

仓库里不放构建产物（`lib/` 在 `.gitignore` 里），所以先从源码构建，再用 `file:` 装本地副本：

```
git clone https://github.com/xincy22/dsh-progress-updates.git
cd dsh-progress-updates
npm install
npm run build
dsh plugin --profile <profile> add file:$PWD
```

也可以让 pnpm 从 git 拉取并就地构建：

```
dsh plugin --profile <profile> add git+https://github.com/xincy22/dsh-progress-updates.git
```

这条会先被 pnpm 拦一次：git 依赖要执行 `prepare` 构建脚本，需先把它加进 profile 的
`pnpm-workspace.yaml`。报错信息里会打印需要粘贴的确切键，形如：

```yaml
allowBuilds:
  dsh-progress-updates@https://codeload.github.com/xincy22/dsh-progress-updates/tar.gz/<commit>: true
```

加完再跑一次同样的 `add`。装完重启对应的 profile，设置在「设置 → 进展更新」。

## 开发

```
npm install      # 装依赖（会顺带跑一次构建）
npm run build    # tsc -b && tsdown，产物在 lib/
npm test         # vitest，10 个文件 186 个用例
npm run typecheck
```

## 与原包的关系

原包 `@eddyskywalker/dsh-chatgpt-subscription` 也注册同名工具 `progress_update` 和同一个提示词分节。两者不要同时启用。

## 与原版的差异

- **设置卡只保留五行**：总开关、催促提醒、催促阈值、输出语言、打开面板。原版那张卡里还挂着缓存预热、检索投影、等待续热、账号缓存亲和、计划模式管线、调度执行守卫、工具失控治理、智能体团队策略段、媒体工具等开关，它们写的是原包核心行的 Config；本包的 Config 只声明四个字段，那些开关搬过来也写不进去，因此没有随进度模块一起剥离。
- `peerDependencies` 收窄到实际验证过的范围：`@deepseek-ai/*` 为 `^0.2.2-rc.1`、`cordis` 为 `^4.1.0`、`schemastery` 为 `^3.19.0`。原版那份一直列到 `0.1.2-alpha.5`，属于没有验证过的承诺。
- 计数与催促节奏：默认阈值 8、按模型步去重、`progress_update` 清零、催促文案原样。**催促多了两个条件**（0.0.3）：必须连续 8 轮**且**距上次进展（或上次催促）超过 3 分钟才会注入，避免连续读文件那种「确实没有新进展可报」的轮次被催；另加独立的「催促提醒」开关，关掉后只保留工具与提示词引导。
- 进展数据不再带来源字段：会话分桶改由工具把会话 id 作为第二个实参交给 sink，wire 上的每条进展只有 id / 标题 / 正文 / 时间戳。
- 客户端 `inject` 从七个收到两个（`slots`、`locale`）：`modelDirectories` / `conversation` / `sessions` / `remote` / `remote.session` 在本插件客户端代码里零引用，是从原核心行照抄过来的。

## 安装提醒

`dsh plugin --profile <profile> add <本目录>` 走绝对路径会得到软链接，运行时会去工作区的依赖树里解析宿主包；用 `file:` 前缀才会把包复制进 profile。另外实测 pnpm 会把本目录的 `node_modules` 搬进 profile 的副本里，装完若还要在本目录构建，先把依赖接回来。

## 标识

- loader 行名与 patch 行 id：`dsh-progress-updates`
- 工具名：`progress_update`（保持原名，提示词与 Code Mode 的调用面都依赖它）
- HTTP 路由：`/api/dsh-progress-updates/updates`
- 客户端样式与面板标识：`dsh-progress-updates/…`
