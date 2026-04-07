# SNG Timer

本项目是一个本地运行的德州扑克 SNG 辅助工具，包含大屏展示页、手机控制页和赛局初始化页，基于 `Node.js + Express + Socket.IO + 原生 HTML/CSS/JS` 实现。

核心目标：

- 笔记本作为主显示屏
- 手机通过局域网访问控制页
- 所有比赛状态由服务端统一维护
- 多客户端实时同步
- 支持初始化建局、盲注计时、思考时间、重报名、平均筹码、奖金计算、暂停展示页轮播

## 路由

- `/setup`
  - 初始化本局 session
- `/display`
  - 大屏展示页
- `/control`
  - 手机控制页

根路径 `/` 会根据当前是否已创建 session 自动跳转：

- 未创建 session -> `/setup`
- 已创建 session -> `/display`

## 技术栈

- Node.js
- Express
- Socket.IO
- 原生 HTML / CSS / JavaScript

## 运行方式

```bash
cd /Users/liweiyu/sng_timer
npm install
node server.js
```

服务监听：

- `0.0.0.0:3000`

局域网访问示例：

- 大屏：`http://你的电脑IP:3000/display`
- 控制页：`http://你的电脑IP:3000/control`

## 初始化流程

先进入 `/setup` 创建本局：

- `STARTING PLAYERS`
  - 可选 `6 / 7 / 8 / 9 / 10`
- `LEVEL DURATION`
  - 6 到 7 人默认 8 分钟
  - 8 到 10 人默认 10 分钟
- `STARTING STACK`
  - 固定 `1500`
- `BUY-IN`
  - 本局报名费

提交后进入比赛流程，并将 session 状态保存在本地 JSON。

## 状态持久化

服务端使用单一 `state` 作为可信来源，并将当前 session 写入：

- [data/session-state.json](/Users/liweiyu/sng_timer/data/session-state.json)

这意味着：

- 页面刷新不会丢状态
- 服务重启后仍可恢复最近一次 session

## 核心状态字段

当前服务端状态包含这些主要字段：

- `sessionConfigured`
- `tournamentStatus`
- `blindLevelIndex`
- `blindLevels`
- `currentLevel`
- `levelDurationMinutes`
- `levelDuration`
- `levelRemaining`
- `thinkingDuration`
- `thinkingRemaining`
- `thinkingActive`
- `timeCardExtra`
- `startingEntries`
- `reentries`
- `alivePlayers`
- `startingStack`
- `buyIn`
- `bountyRate`
- `totalCollected`
- `bountyRemoved`
- `prizePool`
- `payouts`
- `avgStack`
- `avgBB`
- `careerEarningsBoard`

## 比赛逻辑

### 盲注计时

- 服务器每秒递减 `levelRemaining`
- 到 0 后自动进入下一盲注级别
- 最后一级结束后状态切到 `ended`

### 思考时间

- 可通过 control 页面开始、重置、暂停
- 可使用 time card 增加时间
- 比赛暂停时会一并暂停
- 比赛恢复时会按暂停前状态继续

### 提示效果

- `ACTION CLOCK` 最后 3 秒及归零后高亮红色
- `LEVEL CLOCK` 最后 3、2、1 秒在 display 页面播放提示音

## 平均筹码计算

计算规则：

```js
totalEntries = startingEntries + reentries
totalChips = totalEntries * startingStack
avgStack = totalChips / alivePlayers
avgBB = avgStack / currentLevel.bb
```

安全处理：

- 当 `alivePlayers <= 0` 时，`avgStack` 和 `avgBB` 会安全归零，避免 `NaN` 或 `Infinity`

## 奖金计算

### 总收入

```js
totalCollected = (startingEntries * buyIn) + (reentries * buyIn)
```

### 赏金剔除

```js
bountyRemoved = reentries * buyIn * 0.10
```

### 可分配奖金池

```js
prizePool = totalCollected - bountyRemoved
```

### 固定奖金分配

6 到 7 人：

- `1ST = 65%`
- `2ND = 35%`

8 到 10 人：

- `1ST = 50%`
- `2ND = 30%`
- `3RD = 20%`

## Display 页面

当前 display 页面包含：

- 当前级别
- 当前盲注
- 比赛状态
- `LEVEL CLOCK`
- `ACTION CLOCK`
- `PLAYERS LEFT`
- `AVG STACK`
- `AVG BB`

暂停时显示 TRITON 风格黑金 overlay，并轮播：

- `CAREER EARNINGS`
- `PAYOUTS`

轮播规则：

- 生涯奖金最多取前 10 条
- 每页最多显示 5 条
- 超过 5 条自动分页
- 在 career earnings 各页和 payouts 之间横向丝滑切换

## Control 页面

控制页包含：

### Thinking Clock

- `START THINKING`
- `RESET THINKING`
- `PAUSE THINKING`
- `USE TIME CARD`

### Player Flow

- `ELIMINATE PLAYER`
- `RE-ENTER PLAYER`

### Manual Adjust

- `ALIVE +1`
- `ALIVE -1`
- `RE-ENTRY +1`
- `RE-ENTRY -1`

### Management

- `START TOURNAMENT`
- `PAUSE / RESUME TOURNAMENT`
- `PREVIOUS LEVEL`
- `NEXT LEVEL`
- `RESET TOURNAMENT`

## Socket 事件

客户端 -> 服务端：

- `startTournament`
- `pauseTournament`
- `resumeTournament`
- `nextLevel`
- `prevLevel`
- `startThinking`
- `resetThinking`
- `pauseThinking`
- `useTimeCard`
- `eliminatePlayer`
- `reenterPlayer`
- `adjustAlivePlayers`
- `adjustReentries`
- `resetTournament`

服务端 -> 客户端：

- `stateUpdate`

## 主要文件

- [server.js](/Users/liweiyu/sng_timer/server.js)
- [config/tournament.js](/Users/liweiyu/sng_timer/config/tournament.js)
- [public/setup/index.html](/Users/liweiyu/sng_timer/public/setup/index.html)
- [public/display/index.html](/Users/liweiyu/sng_timer/public/display/index.html)
- [public/control/index.html](/Users/liweiyu/sng_timer/public/control/index.html)
- [public/styles.css](/Users/liweiyu/sng_timer/public/styles.css)
- [public/js/socket.js](/Users/liweiyu/sng_timer/public/js/socket.js)

## 已验证场景

### 场景 1：6 人局

- 初始人数 `6`
- 默认级别时长 `8` 分钟
- 初始平均筹码 `1500`
- 奖金按 `65 / 35`
- 通过

### 场景 2：8 人局

- 初始人数 `8`
- 默认级别时长 `10` 分钟
- 奖金按 `50 / 30 / 20`
- pause 页面存在 `PAYOUTS`
- 通过

### 场景 3：6 人局 + 1 次 re-entry，buy-in = 100

- `totalCollected = 700`
- `bountyRemoved = 10`
- `prizePool = 690`
- 奖金按 `65 / 35`
- 通过

### 场景 4：淘汰与重报名对平均筹码影响

- 淘汰后 `alivePlayers` 下降
- 重报名后 `reentries` 和 `alivePlayers` 上升
- `avgStack / avgBB` 自动更新
- 通过

### 场景 5：暂停轮播

- 仅 `paused` 时显示
- `CAREER EARNINGS` 与 `PAYOUTS` 自动轮播
- blind bar 正常显示
- 通过

### 旧功能回归

- `startThinking`
- `pauseThinking`
- `useTimeCard`
- `pauseTournament`
- `resumeTournament`

均已回归验证通过。

## 备注

如果后续要继续扩展，建议优先从这几个方向入手：

- setup 页面增加载入上次 session
- payouts 视觉进一步接近赛事排名板
- career earnings 增加页码提示
- control 页面增加更细的误触保护
