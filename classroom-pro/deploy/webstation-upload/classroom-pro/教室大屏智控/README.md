# 教室大屏智控（一体机 EXE）

一体机专用程序：登录 → 右侧课表待命 → 有任务弹出 → 空闲收回课表条 → 托盘常驻。

## 打包（推荐，不依赖联网）

```bat
cd board-desktop
npm run pack:local
```

产物：

```
dist-exe/
  启动-教室大屏智控.bat
  一体机使用说明.txt
  board-config.json
  教室大屏智控/
    教室大屏智控.exe
    board-config.json
    …（Electron 运行库，整夹拷贝）
```

把 **`教室大屏智控` 整个文件夹** 拷到一体机使用。

## 本地调试

```bat
set BOARD_URL=http://127.0.0.1:5174/?mode=desktop
npm start
```

## 改线上地址

编辑 `board-config.json`：

```json
{ "url": "http://test.zjjdg.top:5666/?mode=desktop" }
```

程序会按顺序读取：环境变量 `BOARD_URL` → exe 同目录 `board-config.json` → 默认测试站。
