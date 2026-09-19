# Web Station「容器化 Node.js」建站说明（按你截图逐步填）

你选的：**容器化脚本语言网站 → Node.js → 20.2**，正确。

本系统不是纯静态站，必须用 Node 跑 `server/`，并由 Web Station 反代。

---

## 一、先准备文档根目录里的文件

在电脑上准备好一个文件夹（例：`classroom-pro-ws`），结构如下后上传到群晖，例如：

`/volume1/web/classroom-pro/`

```
classroom-pro/                 ← 文档根目录指这里
├── package.json               ← 用 deploy/synology/webstation/package.json
├── scripts/
│   └── ensure-dirs.js
├── server/                    ← 整个 server（含 package.json）
│   ├── package.json
│   ├── index.js
│   ├── db.js
│   ├── realtime.js
│   ├── netInfo.js
│   └── …（不要传 node_modules 也行，首次会 npm install）
└── client/
    └── dist/                  ← 必须先在电脑执行 npm run build 再上传
        ├── index.html
        └── assets/
```

### 电脑上生成 `client/dist`

```powershell
cd d:\天门中学\classroom-hub\classroom-pro\client
npm install
npm run build
```

把生成的 `client/dist` 拷进上传包；`server` 整夹拷入；把 `deploy/synology/webstation/package.json` 和 `scripts` 放到根目录。

> 不要上传 `board-desktop/`、两边的 `node_modules`（体积大；Web Station 容器里会再装）。

也可用脚本打包（见同目录 `pack-webstation.ps1`）。

---

## 二、截图第 1 步（选择服务类型）

- 选：**容器化脚本语言网站**
- 服务：**Node.js**
- 版本：**20.2**（或相近 20.x）
- 点「下一步」

---

## 三、截图第 2 步（配置常规设置）怎么填

| 项 | 填写 |
|----|------|
| **名称** | `看班智控台`（随意） |
| **描述** | `课堂管理 Node 服务`（随意） |
| **文档根目录** | 浏览选到 `/web/classroom-pro`（即上面上传的那一层，能看到 `package.json` 和 `server`） |
| **HTTP 后端服务器** | `Nginx`（保持默认即可） |
| **服务器端口** | `3789`（与程序一致；不要用灰色占位 3000，请手动改成 3789） |
| **执行命令** | `npm start` |
| **连接/发送超时** | `60` 可先保持 |
| **读取超时** | 改为 **86400**（WebSocket 长连接，太短会断） |

说明：

- Web Station 会在文档根目录执行 `npm start`。
- 根目录 `package.json` 的 `start` 是 `node server/index.js`。
- 程序监听 `PORT`；若套件注入端口与 3789 不一致，以套件实际「服务器端口」为准，并保证执行前环境变量一致。多数情况下你填的「服务器端口」会作为后端端口，程序用 `process.env.PORT || 3789`，**请把端口填 3789，或把程序端口改成与表单一致**。

若套件强制用 3000：把「服务器端口」留 **3000**，并在群晖该服务的环境变量里设 `PORT=3000`（有则设）；我们代码已支持 `PORT` 环境变量。

---

## 四、后续向导（常见几步）

1. **访问控制 / 门户**  
   - 绑定主机名或在「门户」里加：`http://群晖IP/xxx` 或独立端口  
   - 有域名时再上 HTTPS 证书（手机麦克风需要 HTTPS）

2. **首次启动若失败**  
   - 到 Web Station → 该服务 → 日志  
   - 常见：未上传 `client/dist`、server 依赖未装好、`better-sqlite3` 编译失败  
   - 可在套件「终端」或 SSH 进入文档根执行：  
     `cd server && npm install --omit=dev`  
     再回到根目录 `npm start`

3. **防火墙**  
   - 放行你在门户里用的端口（或 80/443）

---

## 五、建成后怎么打开

- 内网示例：`http://群晖IP:门户端口/`  
- 演示班：`DEMO01` / `123456`  
- 管理：`admin` / `admin123`  
- 教室大屏：同址加 `?mode=board`

管理后台把「互联网回退地址」设成你的 HTTPS 域名（若有）。

---

## 六、和「静态网站」的区别

| 类型 | 能否用本系统 |
|------|----------------|
| 静态网站 | 否 |
| 本机 PHP 等 | 否 |
| **容器化 Node.js** | **可以（你正在建的）** |

---

## 七、麦克风

手机开麦必须用 **HTTPS** 访问（证书 + 门户 HTTPS）。纯 `http://IP` 会被浏览器禁止麦克风；文字喊话仍可用。
