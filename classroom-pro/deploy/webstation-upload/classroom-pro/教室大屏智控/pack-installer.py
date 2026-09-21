# -*- coding: utf-8 -*-
"""将 dist-exe/教室大屏智控 打成单文件安装程序（自解压 EXE）。"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORTABLE = ROOT / "dist-exe" / "教室大屏智控"
OUT_EXE = ROOT / "dist-exe" / "教室大屏智控-安装程序.exe"
MARKER = b"::CCP_BOARD_PAYLOAD_V1::"

CSC_CANDIDATES = [
    Path(os.environ.get("WINDIR", r"C:\Windows"))
    / "Microsoft.NET"
    / "Framework64"
    / "v4.0.30319"
    / "csc.exe",
    Path(os.environ.get("WINDIR", r"C:\Windows"))
    / "Microsoft.NET"
    / "Framework"
    / "v4.0.30319"
    / "csc.exe",
]

CS_SOURCE = r"""
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

class Program {
  static readonly byte[] Marker = Encoding.ASCII.GetBytes("::CCP_BOARD_PAYLOAD_V1::");

  [STAThread]
  static int Main() {
    try {
      string exePath = Assembly.GetExecutingAssembly().Location;
      string destRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        "教室大屏智控");
      string zipPath = Path.Combine(Path.GetTempPath(), "ccp-board-setup-" + Guid.NewGuid().ToString("N") + ".zip");

      Application.EnableVisualStyles();
      var result = MessageBox.Show(
        "将安装「教室大屏智控」到本机，并创建桌面快捷方式。\n\n安装位置：\n" + destRoot,
        "教室大屏智控 - 安装",
        MessageBoxButtons.OKCancel,
        MessageBoxIcon.Information);
      if (result != DialogResult.OK) return 0;

      ExtractPayload(exePath, zipPath);

      if (Directory.Exists(destRoot)) {
        try { Directory.Delete(destRoot, true); } catch { /* ignore */ }
      }
      Directory.CreateDirectory(destRoot);
      ZipFile.ExtractToDirectory(zipPath, destRoot);
      try { File.Delete(zipPath); } catch { /* ignore */ }

      string appExe = Path.Combine(destRoot, "教室大屏智控.exe");
      if (!File.Exists(appExe)) {
        MessageBox.Show("安装失败：未找到主程序。", "教室大屏智控", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
      }

      CreateShortcut(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "教室大屏智控.lnk"),
        appExe,
        destRoot,
        "教室一体机大屏智控");

      string startMenu = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
        "Programs");
      Directory.CreateDirectory(startMenu);
      CreateShortcut(
        Path.Combine(startMenu, "教室大屏智控.lnk"),
        appExe,
        destRoot,
        "教室一体机大屏智控");

      MessageBox.Show("安装完成！即将启动程序。", "教室大屏智控", MessageBoxButtons.OK, MessageBoxIcon.Information);
      Process.Start(new ProcessStartInfo { FileName = appExe, WorkingDirectory = destRoot, UseShellExecute = true });
      return 0;
    } catch (Exception ex) {
      MessageBox.Show("安装失败：\n" + ex.Message, "教室大屏智控", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return 1;
    }
  }

  static void ExtractPayload(string exePath, string zipPath) {
    byte[] all = File.ReadAllBytes(exePath);
    int idx = IndexOf(all, Marker);
    if (idx < 0) throw new Exception("安装包损坏：找不到内嵌数据。");
    int start = idx + Marker.Length;
    using (var fs = File.Create(zipPath)) {
      fs.Write(all, start, all.Length - start);
    }
  }

  static int IndexOf(byte[] data, byte[] pattern) {
    for (int i = 0; i <= data.Length - pattern.Length; i++) {
      bool ok = true;
      for (int j = 0; j < pattern.Length; j++) {
        if (data[i + j] != pattern[j]) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  }

  static void CreateShortcut(string lnkPath, string target, string workDir, string desc) {
    Type t = Type.GetTypeFromProgID("WScript.Shell");
    object shell = Activator.CreateInstance(t);
    object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnkPath });
    Type st = sc.GetType();
    st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
    st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { workDir });
    st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { desc });
    string ico = Path.Combine(workDir, "app.ico");
    if (File.Exists(ico)) {
      st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { ico });
    }
    st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
  }
}
"""


def find_csc() -> Path:
    for p in CSC_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("ERROR: 未找到 csc.exe（.NET Framework），无法编译安装程序")


def ensure_portable() -> None:
    exe = PORTABLE / "教室大屏智控.exe"
    if not exe.exists():
        print("Portable missing, running pack-portable.py ...")
        subprocess.check_call([sys.executable, str(ROOT / "pack-portable.py")], cwd=str(ROOT))
    if not exe.exists():
        raise SystemExit("ERROR: portable EXE still missing")


def build_zip(zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in PORTABLE.rglob("*"):
            if path.is_file():
                arc = path.relative_to(PORTABLE).as_posix()
                zf.write(path, arc)


def compile_stub(csc: Path, stub_exe: Path, cs_file: Path) -> None:
    ref_dir = csc.parent
    cmd = [
        str(csc),
        "/nologo",
        "/target:winexe",
        "/platform:anycpu",
        f"/out:{stub_exe}",
        f"/reference:{ref_dir / 'System.Windows.Forms.dll'}",
        f"/reference:{ref_dir / 'System.Drawing.dll'}",
        f"/reference:{ref_dir / 'System.IO.Compression.dll'}",
        f"/reference:{ref_dir / 'System.IO.Compression.FileSystem.dll'}",
        str(cs_file),
    ]
    subprocess.check_call(cmd)


def copy_to_downloads(setup_exe: Path) -> None:
    # 只放一份到 server/downloads，网站 /downloads 由此提供；不要再拷到 client 以免重复
    targets = [
        ROOT.parent / "server" / "downloads",
    ]
    for d in targets:
        d.mkdir(parents=True, exist_ok=True)
        dest = d / setup_exe.name
        shutil.copy2(setup_exe, dest)
        print("Copied ->", dest)
    # 清掉旧的重复副本（若有）
    for stale in (
        ROOT.parent / "client" / "public" / "downloads" / setup_exe.name,
        ROOT.parent / "client" / "dist" / "downloads" / setup_exe.name,
    ):
        if stale.exists():
            try:
                stale.unlink()
                print("Removed duplicate ->", stale)
            except OSError:
                pass


def main() -> None:
    ensure_portable()
    csc = find_csc()
    print("Using", csc)

    with tempfile.TemporaryDirectory(prefix="ccp-setup-") as td:
        td_path = Path(td)
        zip_path = td_path / "payload.zip"
        cs_file = td_path / "Setup.cs"
        stub_exe = td_path / "stub.exe"

        print("Zipping portable app...")
        build_zip(zip_path)
        print("Zip MB:", round(zip_path.stat().st_size / 1024 / 1024, 1))

        cs_file.write_text(CS_SOURCE, encoding="utf-8")
        print("Compiling installer stub...")
        compile_stub(csc, stub_exe, cs_file)

        OUT_EXE.parent.mkdir(parents=True, exist_ok=True)
        if OUT_EXE.exists():
            OUT_EXE.unlink()

        print("Embedding payload...")
        with open(OUT_EXE, "wb") as out:
            out.write(stub_exe.read_bytes())
            out.write(MARKER)
            out.write(zip_path.read_bytes())

    print("OK", OUT_EXE)
    print("Size MB:", round(OUT_EXE.stat().st_size / 1024 / 1024, 1))
    copy_to_downloads(OUT_EXE)


if __name__ == "__main__":
    main()
