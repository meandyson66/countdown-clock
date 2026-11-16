package com.meandyson.macaurecommend;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.View;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("确定", (dialog, which) -> result.confirm())
                        .setNegativeButton("取消", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("读取失败")
                        .setMessage(message)
                        .setPositiveButton("知道了", (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.confirm())
                        .show();
                return true;
            }
        });
        webView.setOnLongClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setItems(new CharSequence[]{"立即更新"}, (dialog, which) ->
                            webView.evaluateJavascript("window.refreshNow && window.refreshNow()", null))
                    .show();
            return true;
        });
        webView.setLongClickable(true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);
        webView.loadUrl("file:///android_asset/app.html?v=10");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.evaluateJavascript("window.refreshNow && window.refreshNow()", null);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    public static class Bridge {
        private String body = "";
        private int offset = 0;

        @android.webkit.JavascriptInterface
        public String beginFetch(String url) {
            ExecutorService pool = Executors.newSingleThreadExecutor();
            Future<Download> task = pool.submit(() -> download(url));
            try {
                Download result = task.get(10, TimeUnit.SECONDS);
                if (result.body == null) {
                    body = "";
                    offset = 0;
                    return "ERR\n" + result.status + "\n" + result.message;
                }
                body = result.body;
                offset = 0;
                return "OK";
            } catch (TimeoutException ex) {
                task.cancel(true);
                body = "";
                offset = 0;
                return "ERR\n0\n请求超过 10 秒";
            } catch (Exception ex) {
                body = "";
                offset = 0;
                String message = ex.getMessage();
                if (message == null || message.isEmpty()) message = ex.getClass().getSimpleName();
                return "ERR\n0\n" + message;
            } finally {
                pool.shutdownNow();
            }
        }

        @android.webkit.JavascriptInterface
        public String readChunk() {
            if (body == null || offset >= body.length()) return "";
            int end = Math.min(body.length(), offset + 20000);
            String part = body.substring(offset, end);
            offset = end;
            if (offset >= body.length()) body = "";
            return part;
        }

        private Download download(String url) {
            if (url == null || !url.startsWith("https://history.macaumarksix.com/")) {
                return Download.fail(0, "只允许读取公开开奖接口");
            }
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36");
                int status = conn.getResponseCode();
                if (status != 200) {
                    return Download.fail(status, conn.getResponseMessage() == null ? "接口返回异常" : conn.getResponseMessage());
                }
                InputStream input = conn.getInputStream();
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int count;
                while ((count = input.read(chunk)) >= 0) buffer.write(chunk, 0, count);
                input.close();
                return Download.ok(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception ex) {
                String message = ex.getMessage();
                if (message == null || message.isEmpty()) message = ex.getClass().getSimpleName();
                return Download.fail(0, message);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }

    static final class Download {
        final int status;
        final String message;
        final String body;

        private Download(int status, String message, String body) {
            this.status = status;
            this.message = message;
            this.body = body;
        }

        static Download ok(String body) {
            return new Download(200, "OK", body);
        }

        static Download fail(int status, String message) {
            return new Download(status, message == null ? "未知错误" : message, null);
        }
    }
}
