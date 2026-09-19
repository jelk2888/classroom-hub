"""Pack portable 教室大屏智控 EXE using local electron/dist (no download)."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ELECTRON_DIST = ROOT / "node_modules" / "electron" / "dist"
OUT = ROOT / "dist-exe" / "教室大屏智控"
APP_DIR = OUT / "resources" / "app"

FILES = [
    "main.cjs",
    "preload.cjs",
    "board-config.json",
    "package.json",
    "setup.html",
    "setup.js",
]


def main() -> None:
    if not (ELECTRON_DIST / "electron.exe").exists():
        print("ERROR: local electron.exe not found", file=sys.stderr)
        sys.exit(1)

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("Copying Electron runtime...")
    shutil.copytree(
        ELECTRON_DIST,
        OUT,
        ignore=shutil.ignore_patterns("resources"),
    )
    src_res = ELECTRON_DIST / "resources"
    if src_res.exists():
        shutil.copytree(src_res, OUT / "resources")
    if (OUT / "resources" / "default_app.asar").exists():
        (OUT / "resources" / "default_app.asar").unlink()
    if (OUT / "resources" / "app").exists():
        shutil.rmtree(OUT / "resources" / "app")
    APP_DIR.mkdir(parents=True, exist_ok=True)

    for name in FILES:
        src = ROOT / name
        if not src.exists():
            print("ERROR missing", src, file=sys.stderr)
            sys.exit(1)
        shutil.copy2(src, APP_DIR / name)

    # assets (logo)
    assets_src = ROOT / "assets"
    if assets_src.exists():
        shutil.copytree(assets_src, APP_DIR / "assets")
        shutil.copytree(assets_src, OUT / "assets", dirs_exist_ok=True)
        ico = assets_src / "app.ico"
        if ico.exists():
            shutil.copy2(ico, OUT / "app.ico")

    exe = OUT / "electron.exe"
    final_exe = OUT / "教室大屏智控.exe"
    if final_exe.exists():
        final_exe.unlink()
    exe.rename(final_exe)

    shutil.copy2(ROOT / "board-config.json", OUT / "board-config.json")
    launcher = ROOT / "dist-exe" / "启动-教室大屏智控.bat"
    launcher.write_text(
        "@echo off\r\n"
        'cd /d "%~dp0教室大屏智控"\r\n'
        'start "" "教室大屏智控.exe"\r\n',
        encoding="gbk",
        errors="replace",
    )
    shutil.copy2(ROOT / "board-config.json", ROOT / "dist-exe" / "board-config.json")

    readme = ROOT / "dist-exe" / "一体机使用说明.txt"
    readme.write_text(
        "教室大屏智控\r\n"
        "1. 拷贝整个「教室大屏智控」文件夹到一体机\r\n"
        "2. 运行 教室大屏智控.exe\r\n"
        "3. 填写服务器IP、端口、班级码、密码后登录\r\n"
        "4. 登录后右侧显示课表；有任务会弹出；关闭可选收起或退出\r\n"
        "5. 托盘图标可展开/收起/重新登录/退出\r\n",
        encoding="gbk",
        errors="replace",
    )

    print("OK", final_exe)
    print("Size MB:", round(final_exe.stat().st_size / 1024 / 1024, 1))


if __name__ == "__main__":
    main()
