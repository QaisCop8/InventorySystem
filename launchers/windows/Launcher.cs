// مشغّل ويندوز لكاشير نقطة البيع / شاشة المطعم في NoonERP.
// نافذة ويندوز حقيقية (مكبّرة، شريط مهام ويندوز ظاهر) تستضيف محرك Edge (WebView2) وتفتح النظام بـ ?app=... فيظهر بعد
// الدخول واختيار الشركة شاشة الكاشير/المطعم وحدها (lib/app-mode.ts + components/app-mode-shell.tsx).
// زر X: يسأل الصفحة أولاً عن تغييرات غير محفوظة (window.__noonAppCloseState في الكاشير) ثم "هل تريد الخروج من البرنامج؟".
// ملف تعريف مستقل لكل مشغّل في %LOCALAPPDATA%\NoonERP\<mode>. كل تشغيل يطلب كلمة المرور من جديد: الصفحة
// تُقفل الجلسة المحفوظة في أول تحميل (APP_MODE_BOOT_SCRIPT، lib/offline-unlock.ts) وتفتحها البصمة المحلية دون اتصال أو الخادم.
// لا يُمسح شيء من ملف التعريف: الكوكيز (جلسة الخادم لمزامنة مبيعات دون اتصال) ولا IndexedDB (مبيعات دون اتصال لم تُرحَّل بعد).
// عنوان خادم مختلف: launcher.ini بجانب الملف التنفيذي يحوي سطر url=https://...
// مكتبات WebView2 مضمّنة كموارد داخل الملف التنفيذي (ملف واحد) — البناء: node launchers/windows/build.mjs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle(NoonLauncher.Title)]
[assembly: AssemblyProduct("NoonERP")]
[assembly: AssemblyCompany("Sabbah Soft")]
[assembly: AssemblyVersion("1.5.0.0")]
[assembly: AssemblyFileVersion("1.5.0.0")]

static class NoonLauncher
{
#if RESTAURANT
    public const string Title = "NoonERP Restaurant";
    public const string Mode = "restaurant";
#else
    public const string Title = "NoonERP Cashier";
    public const string Mode = "cashier";
#endif
    const string DefaultServer = "https://noonerp.sabbahsoft.com";
    const MessageBoxOptions Rtl = MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign;

    [STAThread]
    static void Main()
    {
        // مكتبات WebView2 المُدارة تُحمَّل من موارد الملف التنفيذي — يجب ربطها قبل أي استخدام لأنواعها
        AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Run();
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run()
    {
        Application.Run(new LauncherForm(ReadServerUrl().TrimEnd('/') + "/?app=" + Mode));
    }

    static Assembly ResolveEmbedded(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name + ".dll";
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        {
            if (stream == null) return null;
            byte[] bytes = new byte[stream.Length];
            stream.Read(bytes, 0, bytes.Length);
            return Assembly.Load(bytes);
        }
    }

    // WebView2Loader.dll (مكتبة أصلية) تُستخرج مرة لكل إصدار إلى %LOCALAPPDATA%\NoonERP\bin\<arch>
    public static string ExtractLoader()
    {
        string arch = Environment.Is64BitProcess ? "x64" : "x86";
        string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NoonERP", "bin", Assembly.GetExecutingAssembly().GetName().Version.ToString(), arch);
        string target = Path.Combine(folder, "WebView2Loader.dll");
        if (!File.Exists(target))
        {
            Directory.CreateDirectory(folder);
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WebView2Loader." + arch + ".dll"))
            using (FileStream file = File.Create(target))
            {
                stream.CopyTo(file);
            }
        }
        return folder;
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

    public static void Error(string message)
    {
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, Rtl);
    }

    public static DialogResult Ask(IWin32Window owner, string message, MessageBoxButtons buttons, MessageBoxIcon icon)
    {
        return MessageBox.Show(owner, message, Title, buttons, icon, MessageBoxDefaultButton.Button2, Rtl);
    }
}

class LauncherForm : Form
{
    readonly string startUrl;
    readonly string serverHost;
    readonly WebView2 web = new WebView2();
    bool allowClose;
    bool closing;

    public LauncherForm(string url)
    {
        startUrl = url;
        serverHost = new Uri(url).Host;
        Text = NoonLauncher.Title;
        WindowState = FormWindowState.Maximized;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 600);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        web.Dock = DockStyle.Fill;
        Controls.Add(web);
        Load += async (sender, args) => await InitializeAsync();
        FormClosing += OnFormClosing;
    }

    async System.Threading.Tasks.Task InitializeAsync()
    {
        try
        {
            CoreWebView2Environment.SetLoaderDllFolderPath(NoonLauncher.ExtractLoader());
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NoonERP", NoonLauncher.Mode);
            Directory.CreateDirectory(profile);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await web.EnsureCoreWebView2Async(environment);
            web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
            // الطباعة المباشرة من المشغّل نفسه (Printing.cs) — الصفحة تتعرف عليه بـ __noonLauncher (lib/local-print.ts)
            await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.__noonLauncher={print:true,version:'" + typeof(NoonLauncher).Assembly.GetName().Version + "'};");
            web.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            web.CoreWebView2.Navigate(startUrl);
        }
        catch (Exception error)
        {
            NoonLauncher.Error("تعذر تشغيل محرك العرض (Microsoft Edge WebView2).\nثبّت WebView2 Runtime من موقع مايكروسوفت ثم أعد المحاولة.\n\n" + error.Message);
            allowClose = true;
            Close();
        }
    }

    // رسالة طباعة من الصفحة: تُنفَّذ في الخلفية ثم يُرسل الرد (نجاح/سبب الفشل) بنفس المعرّف
    void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        System.Collections.IDictionary message;
        try
        {
            message = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(args.WebMessageAsJson) as System.Collections.IDictionary;
        }
        catch { return; }
        if (message == null || !"noon-print".Equals(message["type"])) return;
        object id = message.Contains("id") ? message["id"] : null;
        System.Collections.IList pages = message.Contains("pages") ? message["pages"] as System.Collections.IList : null;
        System.Threading.Thread worker = new System.Threading.Thread(() =>
        {
            string error = null;
            try { NoonPrinter.PrintPages(pages ?? new System.Collections.ArrayList()); }
            catch (Exception exception) { error = exception.Message; }
            string reply = new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new System.Collections.Generic.Dictionary<string, object> {
                { "type", "noon-print-result" }, { "id", id }, { "success", error == null }, { "message", error ?? "" },
            });
            try { BeginInvoke(new Action(() => { if (web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsJson(reply); })); } catch { }
        });
        worker.IsBackground = true;
        worker.SetApartmentState(System.Threading.ApartmentState.STA);
        worker.Start();
    }

    // روابط خارج النظام (واتساب، خرائط...) تُفتح في المتصفح الافتراضي؛ نوافذ النظام نفسه (طباعة...) تبقى داخل المحرك
    void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        Uri target;
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out target)) return;
        if (target.Scheme == "about" || target.Scheme == "blob" || target.Host == serverHost) return;
        args.Handled = true;
        try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); } catch { }
    }

    async void OnFormClosing(object sender, FormClosingEventArgs args)
    {
        if (allowClose || args.CloseReason == CloseReason.WindowsShutDown || args.CloseReason == CloseReason.TaskManagerClosing) return;
        args.Cancel = true;
        if (closing) return;
        closing = true;
        try
        {
            string state = "";
            if (web.CoreWebView2 != null)
            {
                try
                {
                    state = await web.CoreWebView2.ExecuteScriptAsync("(function(){try{return window.__noonAppCloseState?String(window.__noonAppCloseState()||''):''}catch(e){return ''}})()");
                }
                catch { state = ""; }
            }
            if (state.Contains("unsaved"))
            {
                NoonLauncher.Ask(this, "يوجد فاتورة غير محفوظة في الكاشير.\nاحفظ الفاتورة أو ألغها قبل الخروج من البرنامج.", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (state.Contains("busy"))
            {
                NoonLauncher.Ask(this, "يتم الآن حفظ عملية في الكاشير، انتظر حتى تنتهي ثم أعد المحاولة.", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (NoonLauncher.Ask(this, "هل تريد الخروج من البرنامج؟", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            allowClose = true;
            Close();
        }
        finally
        {
            closing = false;
        }
    }
}
