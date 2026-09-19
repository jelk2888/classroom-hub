# 群晖部署说明（Web Station + Container Manager）

本系统是 **Node.js + SQLite + WebSocket**，**不能**只把静态网页丢进 Web Station。  
正确做法：

1. **Container Manager（推荐）** 跑应用容器  
2. **登录门户 / 反向代理**（或 Web Station 反代）把域名 HTTPS 转到容器端口  

这样手机才能用麦克风喊话，外网也能访问。

---

## 一、要上传到群晖的内容

在电脑打包后，上传到例如：`/volume1/docker/classroom-pro/`

```
classroom-pro/                          ← 上传根目录
├── deploy/
│   └── synology/
│       ├── Dockerfile                  ← 必传
│       ├── docker-compose.yml          ← 必传
│       └── env.example                 ← 复制改名为 .env
├── server/                             ← 必传（整目录）
│   ├── package.json
│   ├── package-lock.json（有则传）
│   ├── index.js
│   ├── db.js
│   ├── realtime.js
│   ├── netInfo.js
│   └── …其它 .js（不要传 node_modules、不要传 data/*.db 也可，空库会自动建）
└── client/                             ← 必传（用于镜像内编译）
    ├── package.json
    ├── package-lock.json（有则传）
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig*.json
    └── src/                            ← 全部前端源码
```

### 不要上传（体积大且无用）

| 路径 | 原因 |
|------|------|
| `server/node_modules/` | 镜像内重新安装并按群晖 CPU 编译 |
| `client/node_modules/` | 同上 |
| `client/dist/` | 镜像构建时自动生成 |
| `board-desktop/` | 教室 EXE，与群晖无关 |
| `server/data/*.db` | 可选；新环境会自动建库。若要迁移旧数据再单独拷 |

### 最小文件清单（核对用）

**deploy/synology/**  
- `Dockerfile`  
- `docker-compose.yml`  
- `env.example` → 上传后改名为 `.env`

**server/**（无 node_modules）  
- `package.json`、`package-lock.json`  
- `index.js`、`db.js`、`realtime.js`、`netInfo.js`  
- 其它该目录下自有 `.js`（若有）

**client/**（无 node_modules）  
- `package.json`、`package-lock.json`  
- `index.html`、`vite.config.ts`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`  
- `src/**` 全部

---

## 二、群晖上操作步骤

### 1. 安装套件

- **Container Manager**（原 Docker）  
- （可选）**Web Station** — 仅作反向代理入口时用  
- 控制面板 → **登录门户** → 反向代理（DSM 7 常用）

### 2. 上传文件

用 File Station / SMB 把上一节目录传到：

`/volume1/docker/classroom-pro/`

把 `deploy/synology/env.example` 复制为：

`/volume1/docker/classroom-pro/deploy/synology/.env`

并编辑：

```env
HOST_PORT=3789
PUBLIC_URL=https://你的域名
```

注意：`docker-compose.yml` 的 `build.context` 是 `../..`（项目根 `classroom-pro`）。  
请保证目录结构为：

```
/volume1/docker/classroom-pro/
  deploy/synology/docker-compose.yml
  deploy/synology/Dockerfile
  deploy/synology/.env
  server/
  client/
```

### 3. 创建并启动容器

Container Manager → **项目** → **新增** → 从 `docker-compose.yml` 创建：

- 路径选：`/volume1/docker/classroom-pro/deploy/synology/docker-compose.yml`  
- 构建可能需几分钟（编译 better-sqlite3 + 前端）

启动后访问：

- 内网：`http://群晖IP:3789`  
- 演示：`DEMO01` / `123456`  
- 管理：`admin` / `admin123`

### 4. 反向代理（Web Station / 登录门户）— 强烈建议

为手机麦克风、外网访问配置 HTTPS：

1. 控制面板 → **登录门户** → **高级** → **反向代理服务器** → 新增  
2. 源：`HTTPS` + 你的域名 + `443`  
3. 目的：`HTTP` + `localhost` + `3789`（或你在 `.env` 里改的 `HOST_PORT`）  
4. 开启 WebSocket / 添加 Upgrade、Connection 头（详见 `reverse-proxy备注.txt`）  
5. 证书：用「证书」套件申请 Let's Encrypt  

管理后台把「互联网回退地址」也设成该 `https://域名`。

---

## 三、防火墙

控制面板 → 安全性 → 防火墙：放行 `3789`（或你映射的端口）；若只用反代，可只放行 443。

---

## 四、数据备份

数据库在 Docker 卷 `classroom-pro-data` 内，或映射目录 `/app/data/classroom.db`。  
备份该卷或定期导出管理端「备份」。

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| 构建失败 better-sqlite3 | 确认 Dockerfile 含 `python3 make g++`（已写好） |
| 页面开但 WS 不通 | 反代未开 WebSocket / Upgrade 头 |
| 手机不能开麦 | 必须用 HTTPS 域名访问，不能用纯 HTTP IP |
| 只丢静态到 Web Station | **不行**，本系统必须跑 Node 容器 |

---

## 六、本机快速打包（Windows）

在项目里执行：

```powershell
cd d:\天门中学\classroom-hub\classroom-pro\deploy\synology
powershell -ExecutionPolicy Bypass -File .\pack-upload.ps1
```

会在 `deploy/synology-upload/` 生成可上传目录（已排除 node_modules）。
