// معالج الترحيل من الشامل إلى نون: يقرأ قاعدة الشامل (Pervasive) عبر ODBC على جهاز العميل ويرسلها دفعات
// إلى /api/shamel-migration/agent بالرمز الذي تُنشئه شاشة «ترحيل من الشامل». الخطوات واستعلاماتها تأتي من
// الخادم (lib/shamel-migration/steps.ts) — البرنامج ناقل فقط، فتصحيح استعلام لا يحتاج نسخة جديدة منه.
// البناء: node launchers/shamel-migration/build.mjs (csc من .NET Framework 4 — x86 لأن تعريفات ODBC للشامل 32 بت).
// سطر الأوامر للاختبار: ShamelMigration.exe --dsn DSN --manifest steps.json --export مجلد  (يكتب أسطر كل خطوة JSON بلا خادم)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Data.Odbc;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace NoonShamelMigration
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            if (Array.IndexOf(args, "--export") >= 0) return Cli.Export(args);
            if (Array.IndexOf(args, "--run") >= 0) return Cli.Run(args);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            return 0;
        }
    }

    class Step
    {
        public string Key;
        public string Title;
        public string Sql;
        public int BatchSize;
    }

    // قراءة ODBC وتحويل القيم لـ JSON: نص مقصوص، تاريخ yyyy-MM-dd، أرقام كما هي، و null
    class ShamelReader : IDisposable
    {
        readonly OdbcConnection connection;
        readonly bool fixArabic;
        static readonly Encoding Arabic = Encoding.GetEncoding(1256);

        public ShamelReader(string dsn, string user, string password, bool fixArabic, string owner)
        {
            this.fixArabic = fixArabic;
            connection = new OdbcConnection("DSN=" + dsn + ";uid=" + user + ";pwd=" + password);
            connection.Open();
            // ملفات Btrieve محمية باسم مالك (Owner Name): بدونه يرفض المحرك القراءة بخطأ Btrieve 51
            if (!string.IsNullOrEmpty(owner))
            {
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = "SET OWNER = '" + owner.Replace("'", "''") + "'";
                    command.ExecuteNonQuery();
                }
            }
        }

        public int Count(string table)
        {
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "select count(*) from \"" + table + "\"";
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        object Value(object raw)
        {
            if (raw == null || raw is DBNull) return null;
            if (raw is string)
            {
                var text = ((string)raw).Replace("\0", "").Trim();
                if (fixArabic && text.Length > 0) text = Arabic.GetString(Encoding.Default.GetBytes(text)).Trim();
                return text;
            }
            if (raw is DateTime) return ((DateTime)raw).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            if (raw is double)
            {
                var d = (double)raw;
                return double.IsNaN(d) || double.IsInfinity(d) ? (object)null : d;
            }
            if (raw is float)
            {
                var f = (float)raw;
                return float.IsNaN(f) || float.IsInfinity(f) ? (object)null : (double)f;
            }
            if (raw is decimal || raw is int || raw is long || raw is short || raw is byte || raw is bool || raw is sbyte || raw is ushort || raw is uint) return raw;
            if (raw is byte[]) return null;
            return Convert.ToString(raw, System.Globalization.CultureInfo.InvariantCulture);
        }

        /// يقرأ الخطوة ويستدعي onBatch لكل دفعة (last=true مع الدفعة الأخيرة، ولو فارغة)
        public int Read(Step step, Action<List<Dictionary<string, object>>, bool> onBatch, Func<bool> cancelled)
        {
            int total = 0;
            using (var command = connection.CreateCommand())
            {
                command.CommandText = step.Sql;
                command.CommandTimeout = 0;
                using (var reader = command.ExecuteReader())
                {
                    var names = new string[reader.FieldCount];
                    for (int i = 0; i < names.Length; i++) names[i] = reader.GetName(i).ToLowerInvariant();
                    var batch = new List<Dictionary<string, object>>();
                    while (reader.Read())
                    {
                        if (cancelled()) throw new OperationCanceledException();
                        var row = new Dictionary<string, object>();
                        for (int i = 0; i < names.Length; i++)
                        {
                            object raw;
                            try { raw = reader.GetValue(i); } catch { raw = null; }
                            row[names[i]] = Value(raw);
                        }
                        batch.Add(row);
                        total++;
                        if (batch.Count >= Math.Max(1, step.BatchSize))
                        {
                            onBatch(batch, false);
                            batch = new List<Dictionary<string, object>>();
                        }
                    }
                    onBatch(batch, true);
                }
            }
            return total;
        }

        public void Dispose() { connection.Dispose(); }
    }

    class ServerError : Exception
    {
        public readonly int Status;
        public ServerError(int status, string message) : base(message) { Status = status; }
    }

    class Api
    {
        readonly string baseUrl;
        readonly string token;
        public static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 256 };

        public Api(string server, string token)
        {
            baseUrl = server.TrimEnd('/') + "/api/shamel-migration/agent";
            this.token = token.Trim();
        }

        Dictionary<string, object> Send(string method, object body)
        {
            var request = (HttpWebRequest)WebRequest.Create(baseUrl);
            request.Method = method;
            request.Timeout = 15 * 60 * 1000;
            request.ReadWriteTimeout = 15 * 60 * 1000;
            request.Headers["Authorization"] = "Bearer " + token;
            request.Accept = "application/json";
            if (body != null)
            {
                var bytes = Encoding.UTF8.GetBytes(Json.Serialize(body));
                request.ContentType = "application/json; charset=utf-8";
                request.ContentLength = bytes.Length;
                using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            }
            try
            {
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    return Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
            }
            catch (WebException ex)
            {
                var response = ex.Response as HttpWebResponse;
                if (response == null) throw new ServerError(0, "تعذر الاتصال بالخادم: " + ex.Message);
                string text;
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) text = reader.ReadToEnd();
                string message = text;
                try
                {
                    var parsed = Json.Deserialize<Dictionary<string, object>>(text);
                    if (parsed != null && parsed.ContainsKey("error")) message = Convert.ToString(parsed["error"]);
                }
                catch { }
                throw new ServerError((int)response.StatusCode, message);
            }
        }

        // إعادة المحاولة لانقطاع الشبكة/أخطاء الخادم المؤقتة؛ رفض الرمز (401) أو طلب خاطئ (400) يتوقف فوراً
        Dictionary<string, object> SendWithRetry(string method, object body, Action<string> log)
        {
            for (int attempt = 1; ; attempt++)
            {
                try { return Send(method, body); }
                catch (ServerError ex)
                {
                    if ((ex.Status >= 400 && ex.Status < 500) || attempt >= 5) throw;
                    log("محاولة " + attempt + " فشلت (" + ex.Message + ") — إعادة المحاولة...");
                    Thread.Sleep(3000 * attempt);
                }
            }
        }

        public Dictionary<string, object> Manifest(Action<string> log) { return SendWithRetry("GET", null, log); }

        public Dictionary<string, object> Batch(string step, List<Dictionary<string, object>> rows, bool last, Action<string> log)
        {
            var body = new Dictionary<string, object>();
            body["action"] = "batch";
            body["step"] = step;
            body["rows"] = rows;
            body["last"] = last;
            return SendWithRetry("POST", body, log);
        }

        public void Finish(bool failed, string message, Action<string> log)
        {
            var body = new Dictionary<string, object>();
            body["action"] = "finish";
            body["status"] = failed ? "failed" : "done";
            body["message"] = message;
            try { SendWithRetry("POST", body, log); } catch { }
        }

        public static List<Step> StepsFrom(Dictionary<string, object> manifest)
        {
            var steps = new List<Step>();
            foreach (var item in (ArrayList)manifest["steps"])
            {
                var map = (Dictionary<string, object>)item;
                steps.Add(new Step
                {
                    Key = Convert.ToString(map["key"]),
                    Title = Convert.ToString(map["title"]),
                    Sql = Convert.ToString(map["sql"]),
                    BatchSize = Convert.ToInt32(map["batchSize"]),
                });
            }
            return steps;
        }
    }

    static class Cli
    {
        static string Arg(string[] args, string name, string fallback)
        {
            int index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        // ترحيل بلا واجهة: ShamelMigration.exe --run --server URL --token TOKEN --dsn DSN
        public static int Run(string[] args)
        {
            Action<string> log = message => Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + message);
            try
            {
                var api = new Api(Arg(args, "--server", "https://noonerp.sabbahsoft.com"), Arg(args, "--token", ""));
                var steps = Api.StepsFrom(api.Manifest(log));
                bool fix = Arg(args, "--fix-arabic", Encoding.Default.CodePage != 1256 ? "1" : "0") == "1";
                int failures = 0;
                using (var reader = new ShamelReader(Arg(args, "--dsn", ""), Arg(args, "--user", "Shamel"), Arg(args, "--pwd", "IS011197"), fix, Arg(args, "--owner", "")))
                {
                    foreach (var step in steps)
                    {
                        int stepFailed = 0;
                        int count = reader.Read(step, (batch, last) =>
                        {
                            var result = api.Batch(step.Key, batch, last, log);
                            var stats = result.ContainsKey("stats") ? (Dictionary<string, object>)result["stats"] : null;
                            if (stats != null) stepFailed += Convert.ToInt32(stats["failed"]);
                        }, () => false);
                        failures += stepFailed;
                        log(step.Key + ": " + count + (stepFailed > 0 ? " failed=" + stepFailed : ""));
                    }
                }
                api.Finish(false, failures > 0 ? "أخطاء: " + failures : "", log);
                return failures > 0 ? 2 : 0;
            }
            catch (Exception ex)
            {
                log("ERR " + ex.Message);
                return 1;
            }
        }

        public static int Export(string[] args)
        {
            try
            {
                var manifest = Api.Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Arg(args, "--manifest", "steps.json"), Encoding.UTF8));
                var dir = Arg(args, "--export", "export");
                Directory.CreateDirectory(dir);
                bool fix = Arg(args, "--fix-arabic", Encoding.Default.CodePage != 1256 ? "1" : "0") == "1";
                using (var reader = new ShamelReader(Arg(args, "--dsn", ""), Arg(args, "--user", "Shamel"), Arg(args, "--pwd", "IS011197"), fix, Arg(args, "--owner", "")))
                {
                    foreach (var step in Api.StepsFrom(manifest))
                    {
                        var all = new List<Dictionary<string, object>>();
                        int count = reader.Read(step, (batch, last) => all.AddRange(batch), () => false);
                        File.WriteAllText(Path.Combine(dir, step.Key + ".json"), Api.Json.Serialize(all), new UTF8Encoding(false));
                        Console.WriteLine(step.Key + ": " + count);
                    }
                }
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("ERR " + ex.Message);
                return 1;
            }
        }
    }

    class MainForm : Form
    {
        const string DefaultServer = "https://noonerp.sabbahsoft.com";
        readonly TextBox serverBox = new TextBox();
        readonly TextBox tokenBox = new TextBox();
        readonly ComboBox dsnBox = new ComboBox();
        readonly TextBox userBox = new TextBox();
        readonly TextBox passwordBox = new TextBox();
        readonly CheckBox arabicBox = new CheckBox();
        readonly CheckBox ownerCheck = new CheckBox();
        readonly TextBox ownerBox = new TextBox();
        readonly Button testButton = new Button();
        readonly Button startButton = new Button();
        readonly Button stopButton = new Button();
        readonly Label stepLabel = new Label();
        readonly ProgressBar progress = new ProgressBar();
        readonly ListBox logBox = new ListBox();
        volatile bool cancelRequested;
        Thread worker;

        static string SettingsPath { get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "shamel-migration.ini"); } }

        public MainForm()
        {
            Text = "معالج الترحيل من الشامل إلى نون";
            RightToLeft = RightToLeft.Yes;
            RightToLeftLayout = true;
            Font = new Font("Tahoma", 9.5f);
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(760, 600);
            Size = new Size(860, 680);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var grid = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, AutoSize = true, Padding = new Padding(12) };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddRow(grid, "عنوان الخادم", serverBox);
            AddRow(grid, "رمز الترحيل (من شاشة «ترحيل من الشامل»)", tokenBox);
            AddRow(grid, "مصدر بيانات الشامل (ODBC DSN)", dsnBox);
            AddRow(grid, "مستخدم قاعدة الشامل", userBox);
            AddRow(grid, "كلمة مرور قاعدة الشامل", passwordBox);
            ownerCheck.Text = "ملفات الشامل محمية باسم مالك (Owner Name)";
            ownerCheck.AutoSize = true;
            grid.Controls.Add(new Label(), 0, grid.RowCount);
            grid.Controls.Add(ownerCheck, 1, grid.RowCount++);
            AddRow(grid, "اسم المالك (Owner Name)", ownerBox);
            ownerBox.UseSystemPasswordChar = true;
            ownerBox.Enabled = false;
            ownerCheck.CheckedChanged += delegate { ownerBox.Enabled = ownerCheck.Checked; if (ownerCheck.Checked) ownerBox.Focus(); };
            arabicBox.Text = "تحويل ترميز النصوص العربية (Windows-1256) — فعّله إن ظهرت الأسماء رموزاً غريبة";
            arabicBox.AutoSize = true;
            grid.Controls.Add(new Label(), 0, grid.RowCount);
            grid.Controls.Add(arabicBox, 1, grid.RowCount++);

            passwordBox.UseSystemPasswordChar = true;
            dsnBox.DropDownStyle = ComboBoxStyle.DropDown;
            foreach (var dsn in OdbcSources()) dsnBox.Items.Add(dsn);

            var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(12, 0, 12, 8) };
            testButton.Text = "اختبار الاتصال";
            startButton.Text = "بدء الترحيل";
            stopButton.Text = "إيقاف";
            stopButton.Enabled = false;
            foreach (var button in new[] { startButton, testButton, stopButton })
            {
                button.AutoSize = true;
                button.Padding = new Padding(10, 4, 10, 4);
                buttons.Controls.Add(button);
            }
            startButton.BackColor = Color.FromArgb(22, 163, 74);
            startButton.ForeColor = Color.White;
            startButton.FlatStyle = FlatStyle.Flat;

            stepLabel.Dock = DockStyle.Top;
            stepLabel.Height = 26;
            stepLabel.Padding = new Padding(12, 4, 12, 0);
            stepLabel.Text = "افتح شاشة «أدوات ⇐ ترحيل من الشامل» في نون، أنشئ رمز الترحيل والصقه هنا.";
            progress.Dock = DockStyle.Top;
            progress.Height = 18;
            logBox.Dock = DockStyle.Fill;
            logBox.HorizontalScrollbar = true;
            logBox.IntegralHeight = false;

            Controls.Add(logBox);
            Controls.Add(progress);
            Controls.Add(stepLabel);
            Controls.Add(buttons);
            Controls.Add(grid);

            LoadSettings();
            testButton.Click += delegate { TestConnection(); };
            startButton.Click += delegate { Start(); };
            stopButton.Click += delegate { cancelRequested = true; Log("جارٍ الإيقاف بعد الدفعة الحالية..."); };
            FormClosing += (sender, e) =>
            {
                if (worker != null && worker.IsAlive && MessageBox.Show(this, "الترحيل قيد التنفيذ. هل تريد الإيقاف والخروج؟", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign) != DialogResult.Yes)
                    e.Cancel = true;
                else cancelRequested = true;
            };
        }

        static void AddRow(TableLayoutPanel grid, string caption, Control control)
        {
            var label = new Label { Text = caption, AutoSize = true, Anchor = AnchorStyles.Right | AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
            control.Dock = DockStyle.Fill;
            grid.Controls.Add(label, 0, grid.RowCount);
            grid.Controls.Add(control, 1, grid.RowCount);
            grid.RowCount++;
        }

        // مصادر ODBC من سجل ويندوز (32 بت لهذا البرنامج: WOW6432Node على ويندوز 64، والمستخدم الحالي)
        static IEnumerable<string> OdbcSources()
        {
            var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
            {
                try
                {
                    using (var key = hive.OpenSubKey(@"SOFTWARE\ODBC\ODBC.INI\ODBC Data Sources"))
                    {
                        if (key == null) continue;
                        foreach (var name in key.GetValueNames())
                        {
                            var driver = Convert.ToString(key.GetValue(name));
                            if (driver.IndexOf("Pervasive", StringComparison.OrdinalIgnoreCase) >= 0 || driver.IndexOf("Zen", StringComparison.OrdinalIgnoreCase) >= 0 || driver.IndexOf("PSQL", StringComparison.OrdinalIgnoreCase) >= 0)
                                names.Add(name);
                        }
                    }
                }
                catch { }
            }
            return names;
        }

        void LoadSettings()
        {
            serverBox.Text = DefaultServer;
            userBox.Text = "Shamel";
            passwordBox.Text = "IS011197";
            arabicBox.Checked = Encoding.Default.CodePage != 1256;
            try
            {
                if (!File.Exists(SettingsPath)) return;
                foreach (var line in File.ReadAllLines(SettingsPath, Encoding.UTF8))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    var key = line.Substring(0, eq).Trim().ToLowerInvariant();
                    var value = line.Substring(eq + 1).Trim();
                    if (key == "url" && value.Length > 0) serverBox.Text = value;
                    else if (key == "dsn") dsnBox.Text = value;
                    else if (key == "user" && value.Length > 0) userBox.Text = value;
                    else if (key == "arabic") arabicBox.Checked = value == "1";
                    else if (key == "owner") ownerCheck.Checked = value == "1";
                }
            }
            catch { }
        }

        void SaveSettings()
        {
            try
            {
                File.WriteAllLines(SettingsPath, new[] { "url=" + serverBox.Text.Trim(), "dsn=" + dsnBox.Text.Trim(), "user=" + userBox.Text.Trim(), "arabic=" + (arabicBox.Checked ? "1" : "0"), "owner=" + (ownerCheck.Checked ? "1" : "0") }, Encoding.UTF8);
            }
            catch { }
        }

        void Log(string message)
        {
            if (InvokeRequired) { BeginInvoke(new Action<string>(Log), message); return; }
            logBox.Items.Add(DateTime.Now.ToString("HH:mm:ss") + "  " + message);
            logBox.TopIndex = Math.Max(0, logBox.Items.Count - 1);
            try { File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "shamel-migration.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine, Encoding.UTF8); } catch { }
        }

        void SetStep(string text, int value, int maximum)
        {
            if (InvokeRequired) { BeginInvoke(new Action<string, int, int>(SetStep), text, value, maximum); return; }
            stepLabel.Text = text;
            progress.Maximum = Math.Max(1, maximum);
            progress.Value = Math.Min(progress.Maximum, Math.Max(0, value));
        }

        void SetRunning(bool running)
        {
            if (InvokeRequired) { BeginInvoke(new Action<bool>(SetRunning), running); return; }
            startButton.Enabled = testButton.Enabled = !running;
            stopButton.Enabled = running;
            foreach (Control control in new Control[] { serverBox, tokenBox, dsnBox, userBox, passwordBox, arabicBox, ownerCheck }) control.Enabled = !running;
            ownerBox.Enabled = !running && ownerCheck.Checked;
        }

        void TestConnection()
        {
            try
            {
                using (var reader = new ShamelReader(dsnBox.Text.Trim(), userBox.Text.Trim(), passwordBox.Text, arabicBox.Checked, OwnerName))
                    Log("الاتصال بقاعدة الشامل ناجح — عدد الحسابات: " + reader.Count("accounts") + "، الأصناف: " + reader.Count("stock") + "، السندات: " + reader.Count("cpage"));
            }
            catch (Exception ex) { Log("فشل الاتصال بقاعدة الشامل: " + ex.Message + OwnerHint(ex)); }
            if (tokenBox.Text.Trim().Length == 0) { Log("لم يُدخل رمز الترحيل بعد"); return; }
            try
            {
                var manifest = new Api(serverBox.Text.Trim(), tokenBox.Text).Manifest(Log);
                var run = (Dictionary<string, object>)manifest["run"];
                Log("الاتصال بالخادم ناجح — الشركة: " + run["company"] + "، الخطوات: " + Api.StepsFrom(manifest).Count);
            }
            catch (Exception ex) { Log("فشل الاتصال بالخادم: " + ex.Message); }
        }

        void Start()
        {
            if (dsnBox.Text.Trim().Length == 0 || tokenBox.Text.Trim().Length == 0)
            {
                MessageBox.Show(this, "أدخل مصدر بيانات الشامل ورمز الترحيل", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
                return;
            }
            SaveSettings();
            cancelRequested = false;
            SetRunning(true);
            string server = serverBox.Text.Trim(), token = tokenBox.Text, dsn = dsnBox.Text.Trim(), user = userBox.Text.Trim(), password = passwordBox.Text;
            bool fix = arabicBox.Checked;
            string owner = OwnerName;
            if (ownerCheck.Checked && owner.Length == 0)
            {
                SetRunning(false);
                MessageBox.Show(this, "أدخل اسم المالك (Owner Name) أو ألغِ تحديد الخيار", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
                return;
            }
            worker = new Thread(() => Run(server, token, dsn, user, password, fix, owner)) { IsBackground = true };
            worker.Start();
        }

        string OwnerName { get { return ownerCheck.Checked ? ownerBox.Text : ""; } }

        // Btrieve 51 = اسم مالك ملفات الشامل مطلوب أو خاطئ
        static string OwnerHint(Exception ex)
        {
            return ex.Message.IndexOf("Btrieve Error 51", StringComparison.OrdinalIgnoreCase) >= 0 || ex.Message.IndexOf("owner name", StringComparison.OrdinalIgnoreCase) >= 0
                ? " — ملفات الشامل محمية باسم مالك: فعّل «ملفات الشامل محمية باسم مالك» وأدخل اسم المالك الصحيح"
                : "";
        }

        void Run(string server, string token, string dsn, string user, string password, bool fixArabic, string owner)
        {
            var api = new Api(server, token);
            int failures = 0;
            try
            {
                var steps = Api.StepsFrom(api.Manifest(Log));
                Log("بدء الترحيل — " + steps.Count + " خطوة");
                using (var reader = new ShamelReader(dsn, user, password, fixArabic, owner))
                {
                    for (int index = 0; index < steps.Count; index++)
                    {
                        var step = steps[index];
                        SetStep("(" + (index + 1) + "/" + steps.Count + ") " + step.Title, index, steps.Count);
                        int sent = 0, stepFailed = 0;
                        int count = reader.Read(step, (batch, last) =>
                        {
                            var result = api.Batch(step.Key, batch, last, Log);
                            sent += batch.Count;
                            var stats = result.ContainsKey("stats") ? (Dictionary<string, object>)result["stats"] : null;
                            if (stats != null) stepFailed += Convert.ToInt32(stats["failed"]);
                            SetStep("(" + (index + 1) + "/" + steps.Count + ") " + step.Title + " — " + sent, index, steps.Count);
                        }, () => cancelRequested);
                        failures += stepFailed;
                        Log(step.Title + ": " + count + " سجل" + (stepFailed > 0 ? " — أخطاء: " + stepFailed + " (راجع سجل الأخطاء في نون)" : ""));
                    }
                }
                SetStep("انتهى الترحيل" + (failures > 0 ? " مع " + failures + " خطأ — راجع سجل الأخطاء في شاشة «ترحيل من الشامل»" : " بنجاح"), 1, 1);
                api.Finish(false, failures > 0 ? "أخطاء: " + failures : "", Log);
                Log("انتهى الترحيل");
            }
            // الإيقاف/الخطأ لا يُنهي التشغيل بالخادم: إعادة البدء بنفس الرمز تكمل، والسجلات المرحّلة لا تتكرر
            catch (OperationCanceledException)
            {
                Log("أُوقف الترحيل — يمكن البدء من جديد بنفس الرمز، والسجلات المرحّلة لا تتكرر");
                SetStep("أُوقف الترحيل", 0, 1);
            }
            catch (Exception ex)
            {
                Log("توقف الترحيل: " + ex.Message + OwnerHint(ex) + " — صحّح السبب وابدأ من جديد بنفس الرمز");
                SetStep("توقف الترحيل: " + ex.Message, 0, 1);
            }
            finally { SetRunning(false); }
        }
    }
}
