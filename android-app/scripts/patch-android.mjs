// يُشغَّل بعد "npx cap add android" (المجلد android/ يُولَّد في كل بناء ولا يُحفظ في git):
// - صلاحيات الكاميرا (مسح الباركود من المتصفح) وحالة الشبكة.
// - رقم الإصدار من APP_VERSION_CODE / APP_VERSION_NAME (GitHub: رقم التشغيل).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8"))
const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml")
const gradlePath = join(root, "android", "app", "build.gradle")
if (!existsSync(manifestPath)) throw new Error("android/ غير موجود — شغّل npx cap add android أولاً")

let manifest = readFileSync(manifestPath, "utf8")
const permissions = ["android.permission.CAMERA", "android.permission.ACCESS_NETWORK_STATE"]
for (const permission of permissions) {
  if (!manifest.includes(`"${permission}"`)) {
    manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${permission}" />\n</manifest>`)
  }
}
// الكاميرا اختيارية: لا تمنع تثبيت التطبيق على أجهزة بلا كاميرا
if (!manifest.includes("android.hardware.camera")) {
  manifest = manifest.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`)
}
writeFileSync(manifestPath, manifest)

const versionCode = Number.parseInt(process.env.APP_VERSION_CODE || "", 10)
const versionName = String(process.env.APP_VERSION_NAME || "").trim()
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, "utf8")
  if (versionCode > 0) gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  if (versionName) gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
  // فحص lint يعمل تلقائياً مع assembleRelease وقد يوقف البناء على تحذيرات لا تخص غلاف Capacitor
  if (!gradle.includes("checkReleaseBuilds")) {
    gradle = gradle.replace(/android\s*\{/, (match) => `${match}\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }`)
  }
  writeFileSync(gradlePath, gradle)
}
// Android WebView does not reliably open the print screen from JavaScript
// window.print(). Use Android's PrintManager through a local Capacitor plugin.
const packageDir = String(config.appId || "").replace(/\./g, "/")
if (!packageDir || packageDir.includes("..")) throw new Error("Invalid appId in capacitor.config.json")
const javaDir = join(root, "android", "app", "src", "main", "java", packageDir)
const activityPath = join(javaDir, "MainActivity.java")
if (!existsSync(activityPath)) throw new Error(`MainActivity.java not found at ${activityPath}`)
const activity = readFileSync(activityPath, "utf8")
const packageMatch = activity.match(/^package\s+([\w.]+);/m)
if (!packageMatch) throw new Error("Could not determine the Android package name from MainActivity.java")

const pluginSource = `package ${packageMatch[1]};

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintJob;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<PrintJob, WebView> activePrints = new HashMap<>();

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "NoonERP Document");
        String baseUrl = call.getString("baseUrl", "https://localhost");
        if (html == null || html.isEmpty()) {
            call.reject("Print content is empty");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The Android activity is unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            WebView printView = new WebView(activity);
            printView.getSettings().setJavaScriptEnabled(false);
            printView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    if (printManager == null) {
                        call.reject("Android print service is unavailable");
                        printView.destroy();
                        return;
                    }
                    try {
                        PrintJob printJob = printManager.print(
                            title,
                            printView.createPrintDocumentAdapter(title),
                            new PrintAttributes.Builder().build()
                        );
                        activePrints.put(printJob, printView);
                        monitorPrintJob(printJob, printView);
                        JSObject result = new JSObject();
                        result.put("jobId", printJob.getId().toString());
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Could not open Android print screen", error);
                        printView.destroy();
                    }
                }
            });
            printView.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null);
        });
    }

    private void monitorPrintJob(PrintJob printJob, WebView printView) {
        Runnable checkJob = new Runnable() {
            @Override
            public void run() {
                if (printJob.isCompleted() || printJob.isCancelled() || printJob.isFailed()) {
                    activePrints.remove(printJob);
                    printView.destroy();
                } else {
                    handler.postDelayed(this, 1000);
                }
            }
        };
        handler.postDelayed(checkJob, 1000);
    }
}
`

// روابط خادم النظام تبقى داخل التطبيق دائماً — بما فيها زر "إعادة المحاولة" في صفحة عدم الاتصال
// (offline.html تُحمَّل من https://localhost فكان الانتقال منها للخادم يُحوَّل أحياناً للمتصفح الخارجي).
// أي رابط آخر (واتساب، خرائط...) يبقى بسلوك Capacitor الافتراضي (يفتح خارج التطبيق).
const serverHost = new URL(String(config.server?.url || "https://localhost")).host.toLowerCase()
if (!/^[a-z0-9.-]+(:\d+)?$/.test(serverHost)) throw new Error(`Invalid server host: ${serverHost}`)
const webViewClientSource = `package ${packageMatch[1]};

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

public class ServerWebViewClient extends BridgeWebViewClient {
    private static final String SERVER_HOST = "${serverHost}";

    public ServerWebViewClient(Bridge bridge) {
        super(bridge);
    }

    private static boolean isAppUrl(Uri url) {
        if (url == null) return false;
        String scheme = url.getScheme();
        String authority = url.getAuthority();
        if (authority == null || !("https".equals(scheme) || "http".equals(scheme))) return false;
        String host = authority.toLowerCase();
        return host.equals(SERVER_HOST) || host.equals("localhost");
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (request != null && request.isForMainFrame() && isAppUrl(request.getUrl())) return false;
        return super.shouldOverrideUrlLoading(view, request);
    }

    @SuppressWarnings("deprecation")
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (url != null && isAppUrl(Uri.parse(url))) return false;
        return super.shouldOverrideUrlLoading(view, url);
    }
}
`

mkdirSync(javaDir, { recursive: true })
writeFileSync(join(javaDir, "NativePrintPlugin.java"), pluginSource)
writeFileSync(join(javaDir, "ServerWebViewClient.java"), webViewClientSource)
let activitySource = activity
if (!activity.includes("registerPlugin(NativePrintPlugin.class)")) {
  let patchedActivity
  const superOnCreate = /super\.onCreate\(savedInstanceState\);/
  const onCreateMethod = /public\s+void\s+onCreate\s*\(\s*Bundle\s+savedInstanceState\s*\)\s*\{/
  if (superOnCreate.test(activity)) {
    patchedActivity = activity.replace(
      superOnCreate,
      "registerPlugin(NativePrintPlugin.class);\n        super.onCreate(savedInstanceState);",
    )
  } else if (onCreateMethod.test(activity)) {
    patchedActivity = activity.replace(
      onCreateMethod,
      "$&\n        registerPlugin(NativePrintPlugin.class);",
    )
  } else {
    const bridgeActivityClass = /((?:public\s+)?class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/
    const classMatch = activity.match(bridgeActivityClass)
    if (!classMatch || classMatch.index === undefined) {
      throw new Error("Could not find MainActivity class extending BridgeActivity")
    }

    let source = activity
    if (!/^import\s+android\.os\.Bundle;/m.test(source)) {
      source = source.replace(/^(package\s+[\w.]+;\s*)/m, "$1\nimport android.os.Bundle;\n")
    }
    const updatedClassMatch = source.match(bridgeActivityClass)
    if (!updatedClassMatch || updatedClassMatch.index === undefined) {
      throw new Error("Could not locate MainActivity class after adding Bundle import")
    }
    const insertionPoint = updatedClassMatch.index + updatedClassMatch[0].length
    patchedActivity = `${source.slice(0, insertionPoint)}\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(NativePrintPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n${source.slice(insertionPoint)}`
  }
  activitySource = patchedActivity
}
// بعد super.onCreate يكون bridge قد أُنشئ — يُستبدل عميل WebView بالنسخة التي تُبقي روابط الخادم داخل التطبيق
if (!activitySource.includes("ServerWebViewClient")) {
  const superOnCreateLine = /super\.onCreate\(savedInstanceState\);/
  if (!superOnCreateLine.test(activitySource)) throw new Error("Could not find super.onCreate in MainActivity to attach ServerWebViewClient")
  activitySource = activitySource.replace(
    superOnCreateLine,
    "$&\n        if (this.bridge != null) this.bridge.setWebViewClient(new ServerWebViewClient(this.bridge));",
  )
}
writeFileSync(activityPath, activitySource)
console.log("Android project patched")
