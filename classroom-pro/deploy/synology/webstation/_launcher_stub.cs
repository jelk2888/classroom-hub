using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class Program {
  [STAThread]
  static void Main() {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string bat = Path.Combine(dir, "一键启动网站服务.bat");
    if (!File.Exists(bat)) {
      MessageBox.Show("未找到「一键启动网站服务.bat」，请与本程序放在同一目录。", "看班智控台 Pro");
      return;
    }
    Process.Start(new ProcessStartInfo {
      FileName = bat,
      WorkingDirectory = dir,
      UseShellExecute = true
    });
  }
}
