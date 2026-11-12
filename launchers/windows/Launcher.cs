// مشغّل ويندوز لكاشير نقطة البيع / شاشة المطعم في NoonERP.
// يفتح النظام في نافذة تطبيق كاملة الشاشة (Edge/Chrome بوضع --app: بلا شريط عنوان أو تبويبات) بملف تعريف مستقل
// لكل مشغّل، فيبقى تسجيل الدخول محفوظاً ويفتح النظام مباشرة على شاشة الكاشير/المطعم (?app=... ← lib/app-mode.ts).
// الخروج: Alt+F4. عنوان خادم مختلف: ملف launcher.ini بجانب الملف التنفيذي يحوي سطر url=https://...
// البناء: node launchers/windows/build.mjs (يستخدم csc.exe المرفق مع .NET Framework في ويندوز)، و/define:RESTAURANT لنسخة المطعم.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle(NoonLauncher.Title)]
[assembly: AssemblyProduct("NoonERP")]
[assembly: AssemblyCompany("Sabbah Soft")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class NoonLauncher
{
#if RESTAURANT
    public const string Title = "NoonERP Restaurant";
    const string Mode = "restaurant";
#else
    public const string Title = "NoonERP Cashier";
    const string Mode = "cashier";
#endif
    const string DefaultServer = "https://noonerp.sabbahsoft.com";

    [STAThread]
    static int Main()
    {
        string server = ReadServerUrl();
        string url = server.TrimEnd('/') + "/?app=" + Mode;
        string browser = FindBrowser();
        if (browser == null)
        {
            // بلا Edge أو Chrome: يُفتح الرابط في المتصفح الافتراضي (نافذة عادية)
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); return 0; }
            catch (Exception error)
            {
                MessageBox.Show("تعذر فتح النظام:\n" + error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
                return 1;
            }
        }

        string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NoonERP", Mode);
        Directory.CreateDirectory(profile);
        string args = "--app=\"" + url + "\" --start-fullscreen --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check --disable-features=Translate";
        try
        {
            Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("تعذر تشغيل المتصفح:\n" + error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            return 1;
        }
    }

    // launcher.ini بجانب الملف: url=https://example.com (اختياري)
    static string ReadServerUrl()
    {
        try
        {
            string ini = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher.ini");
            if (File.Exists(ini))
            {
                foreach (string raw in File.ReadAllLines(ini))
                {
                    string line = raw.Trim();
                    if (!line.StartsWith("url=", StringComparison.OrdinalIgnoreCase)) continue;
                    string value = line.Substring(4).Trim();
                    Uri parsed;
                    if (Uri.TryCreate(value, UriKind.Absolute, out parsed) && (parsed.Scheme == "https" || parsed.Scheme == "http")) return value;
                }
            }
        }
        catch { }
        return DefaultServer;
    }

    static string FindBrowser()
    {
        string[] names = { "msedge.exe", "chrome.exe" };
        foreach (string name in names)
        {
            string fromRegistry = AppPath(Registry.LocalMachine, name) ?? AppPath(Registry.CurrentUser, name);
            if (fromRegistry != null && File.Exists(fromRegistry)) return fromRegistry;
        }
        string[] candidates = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (string path in candidates) if (File.Exists(path)) return path;
        return null;
    }

    static string AppPath(RegistryKey root, string exe)
    {
        try
        {
            using (RegistryKey key = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe))
            {
                return key == null ? null : key.GetValue(null) as string;
            }
        }
        catch { return null; }
    }
}
