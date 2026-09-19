# 看班智控台 Pro（SQLite）

对照「远程看班神器」离线包重做的全功能课堂管理系统。数据存 **SQLite**，跨设备用 **SSE** 同步呼叫/点名/计时实况。

布局与原版不同：左侧竖栏导航 + 右侧大屏实况，而非顶部 Tab 堆叠。

## 功能

- 班级注册 / 登录 / 改密（待审核）
- 管理后台：审核班级、使用统计
- 远程叫人（多选、播报文案、语音、呼叫记录、SSE 同步）
- 纪律管理（违纪/表扬、日周筛选、自动加减分与宠物星星）
- 作业布置（学科、双栏完成率、交作业加分）
- 随机点名（滚动、全班/未点到、历史）
- 计时工具（倒计时/秒表，大屏同步）
- 班级日志、公告
- 班级宠物（喂养、结算、成长阶段）
- 值日轮值（换组、完成加分）
- 班级积分 + 兑换商城
- Excel/CSV 名单导入、备份导出

## 启动

```bash
# 终端 1：API（SQLite）
cd classroom-hub/classroom-pro/server
npm install
npm run dev

# 终端 2：前端
cd classroom-hub/classroom-pro/client
npm install
npm run dev
```

- 前端：http://127.0.0.1:5174
- API：http://127.0.0.1:3789
- 演示班级：`DEMO01` / `123456`
- 管理员：`admin` / `admin123`

教室一体机请用教师端「打开教室大屏」弹出独立窗口；可最小化，发任务时会自动唤起并播报（受浏览器安全策略限制时，请点一下任务栏窗口）。

## 群晖 NAS 部署

本系统需 **Node.js 容器**，不能只把静态站丢进 Web Station。  
配置与上传清单见：

- `deploy/synology/SYNOLOGY-部署说明.md`
- `deploy/synology/上传内容清单.txt`

一键打包上传目录：

```powershell
cd classroom-hub/classroom-pro/deploy/synology
powershell -ExecutionPolicy Bypass -File .\pack-upload.ps1
```

生成目录：`deploy/synology-upload/classroom-pro/` → 整夹上传到 `/volume1/docker/classroom-pro/`，用 Container Manager 启动，再用登录门户做 HTTPS 反向代理。

## 双端用法

1. 电脑/手机登录**教师端**  
2. 教室一体机：  
   - **网页版**：点「打开教室大屏」，或访问 `/?mode=board`  
   - **EXE 托盘版**：见 `board-desktop/`，可最小化到右下角，教师发任务自动弹出  
3. 教师端叫人/点名/计时/公告/摄像头 → 大屏 WebSocket 实时同步 + 语音  

### 自动连接大屏

教室大屏保持登录在线后，教师在**手机或另一台电脑**再次打开教师端、登录**同一班级**，会自动加入实时通道：侧栏显示「大屏：在线」，无需再点「打开教室大屏」。发任务会经服务器推到教室。

### 网络：局域网优先

启动时客户端会**先探测局域网 API**，不通再使用互联网回退地址。

- 服务端监听 `0.0.0.0`，控制台打印本机局域网 URL（如 `http://192.168.x.x:3789`）
- 管理后台可配置「互联网回退地址」，或环境变量 `PUBLIC_URL`
- 登录页也可填写并记住互联网地址（4G 外出时用）
- 开发前端已监听 `0.0.0.0:5174`，同 WiFi 手机可访问 `http://电脑局域网IP:5174`

### 审核开关

管理后台（admin / admin123）可切换「自动审核通过 / 手动审核」，并配置公网回退 URL。

### 摄像头喊话

教师端「摄像头喊话」模块：请求一体机开摄像头（WebRTC），并可远程文字喊话（教室语音播报）。

数据库文件：`server/data/classroom.db`
