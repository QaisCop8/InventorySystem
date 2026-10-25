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

mkdirSync(javaDir, { recursive: true })
writeFileSync(join(javaDir, "NativePrintPlugin.java"), pluginSource)
if (!activity.includes("registerPlugin(NativePrintPlugin.class)")) {
  const patchedActivity = activity.replace(
    /super\.onCreate\(savedInstanceState\);/,
    "registerPlugin(NativePrintPlugin.class);\n        super.onCreate(savedInstanceState);",
  )
  if (patchedActivity === activity) throw new Error("Could not register NativePrintPlugin in MainActivity.java")
  writeFileSync(activityPath, patchedActivity)
}
console.log("Android project patched")
