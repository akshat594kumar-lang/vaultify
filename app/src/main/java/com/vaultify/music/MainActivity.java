package com.vaultify.music;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final int FILE_CHOOSER_CODE = 103;
    private static final int EQ_REQUEST_CODE = 5001;

    private WebView webView;
    private BroadcastReceiver mediaActionReceiver;
    private BroadcastReceiver seekReceiver;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean musicServiceStarted = false;
    private OkHttpClient httpClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        httpClient = new OkHttpClient.Builder()
            .connectTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .build();

        setupWebView();
        requestAllPermissions();
        setupReceivers();
    }

    private void setupWebView() {
        webView = findViewById(R.id.webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        webView.setKeepScreenOn(true);
        webView.addJavascriptInterface(new NativeBridge(), "AndroidNativeBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    view.loadUrl(url);
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String host = request.getUrl().getHost();

                // ⚡ ONLY API endpoints — NOT CDN (audio direct jaayega)
                if (host != null && (
                    host.contains("jiosaavn.com") ||
                    host.contains("saavn-api-delta.vercel.app") ||
                    host.contains("api-v2.soundcloud.com") ||
                    host.contains("api.soundcloud.com")
                )) {
                    try {
                        Request.Builder rb = new Request.Builder()
                            .url(url)
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                            .header("Accept", "application/json, text/plain, */*")
                            .header("Referer", "https://www.jiosaavn.com/")
                            .header("Origin", "https://www.jiosaavn.com");

                        Map<String, String> reqHeaders = request.getRequestHeaders();
                        if (reqHeaders != null) {
                            for (Map.Entry<String, String> e : reqHeaders.entrySet()) {
                                String k = e.getKey();
                                if (k != null && !k.equalsIgnoreCase("user-agent")
                                    && !k.equalsIgnoreCase("referer")
                                    && !k.equalsIgnoreCase("origin")
                                    && !k.equalsIgnoreCase("host")
                                    && !k.equalsIgnoreCase("accept-encoding")) {
                                    try { rb.header(k, e.getValue()); } catch (Exception ex) {}
                                }
                            }
                        }

                        Request req = rb.build();
                        Response response = httpClient.newCall(req).execute();
                        ResponseBody body = response.body();

                        String contentType = response.header("Content-Type", "application/json");

                        Map<String, String> respHeaders = new HashMap<>();
                        respHeaders.put("Access-Control-Allow-Origin", "*");
                        respHeaders.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                        respHeaders.put("Access-Control-Allow-Headers", "*");

                        if (body != null) {
                            return new WebResourceResponse(
                                contentType,
                                "UTF-8",
                                response.code(),
                                response.message(),
                                respHeaders,
                                body.byteStream()
                            );
                        }
                        return new WebResourceResponse(contentType, "UTF-8", response.code(), response.message(), respHeaders, new ByteArrayInputStream(new byte[0]));
                    } catch (Exception e) {
                        return null;
                    }
                }
                return null;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = cb;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void startMusicServiceIfNeeded() {
        if (musicServiceStarted) return;
        try {
            Intent serviceIntent = new Intent(this, MusicService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(serviceIntent);
            else startService(serviceIntent);
            musicServiceStarted = true;
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void setupReceivers() {
        mediaActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                if (action != null && webView != null) {
                    String js = "handleNativeMediaAction('" + action + "');";
                    webView.post(() -> webView.evaluateJavascript(js, null));
                }
            }
        };
        IntentFilter filter = new IntentFilter("VAULTIFY_MEDIA_ACTION");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(mediaActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(mediaActionReceiver, filter);

        seekReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long pos = intent.getLongExtra("position", 0);
                if (webView != null) {
                    String js = "handleNativeSeek(" + pos + ");";
                    webView.post(() -> webView.evaluateJavascript(js, null));
                }
            }
        };
        IntentFilter seekFilter = new IntentFilter("VAULTIFY_SEEK");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(seekReceiver, seekFilter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(seekReceiver, seekFilter);
    }

    private void requestAllPermissions() {
        ArrayList<String> perms = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) perms.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) perms.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) perms.add(Manifest.permission.READ_MEDIA_AUDIO);
        }
        if (!perms.isEmpty()) ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), PERMISSION_REQUEST_CODE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (webView != null) webView.post(() -> webView.evaluateJavascript("if(window.onNativePermissionResult) window.onNativePermissionResult();", null));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    public class NativeBridge {

        @JavascriptInterface
        public void updateNotification(String title, String artist, String cover, boolean playing) {
            if (!musicServiceStarted) startMusicServiceIfNeeded();
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("UPDATE_NOTIFICATION");
                intent.putExtra("title", title);
                intent.putExtra("artist", artist);
                intent.putExtra("cover", cover);
                intent.putExtra("playing", playing);
                try {
                    if (!musicServiceStarted) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
                        else startService(intent);
                        musicServiceStarted = true;
                    } else startService(intent);
                } catch (Exception e) { e.printStackTrace(); }
            });
        }

        @JavascriptInterface
        public void updateProgress(long positionMs, long durationMs) {
            if (!musicServiceStarted) return;
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("UPDATE_PROGRESS");
                intent.putExtra("position", positionMs);
                intent.putExtra("duration", durationMs);
                try { startService(intent); } catch (Exception e) {}
            });
        }

        @JavascriptInterface
        public void stopNotification() {
            if (!musicServiceStarted) return;
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("STOP_NOTIFICATION");
                try { startService(intent); } catch (Exception e) {}
            });
        }

        @JavascriptInterface public void toast(String msg) { runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show()); }
        @JavascriptInterface public void requestPermissions() { runOnUiThread(MainActivity.this::requestAllPermissions); }
        @JavascriptInterface public boolean hasMicPermission() { return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }
        @JavascriptInterface public boolean hasNotificationPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            return true;
        }
        @JavascriptInterface public void openAppSettings() {
            runOnUiThread(() -> { Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS); intent.setData(Uri.parse("package:" + getPackageName())); startActivity(intent); });
        }
        @JavascriptInterface public void openSystemEqualizer() {
            runOnUiThread(() -> {
                try { Intent intent = new Intent("android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL"); intent.putExtra("android.media.extra.AUDIO_SESSION", 0); intent.putExtra("android.media.extra.CONTENT_TYPE", 0); startActivityForResult(intent, EQ_REQUEST_CODE); }
                catch (Exception e) { try { Intent f = new Intent(Settings.ACTION_SOUND_SETTINGS); f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(f); } catch (Exception e2) {} }
            });
        }
        @JavascriptInterface public void minimizeApp() {
            runOnUiThread(() -> { Intent s = new Intent(Intent.ACTION_MAIN); s.addCategory(Intent.CATEGORY_HOME); s.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(s); });
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, android.view.KeyEvent event) {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK && webView != null) {
            webView.evaluateJavascript("(function(){ try { return handleSystemBackPress() ? 'handled' : 'unhandled'; } catch(e) { return 'unhandled'; } })();",
                value -> {
                    if (value != null && value.contains("unhandled")) {
                        Intent s = new Intent(Intent.ACTION_MAIN);
                        s.addCategory(Intent.CATEGORY_HOME);
                        s.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(s);
                    }
                });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override protected void onDestroy() {
        if (mediaActionReceiver != null) { try { unregisterReceiver(mediaActionReceiver); } catch (Exception e) {} }
        if (seekReceiver != null) { try { unregisterReceiver(seekReceiver); } catch (Exception e) {} }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override protected void onPause() { super.onPause(); if (webView != null) webView.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
}