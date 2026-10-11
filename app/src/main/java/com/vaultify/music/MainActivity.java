package com.vaultify.music;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int NOTIF_PERMISSION_CODE = 101;
    private static final int MIC_PERMISSION_CODE = 102;

    private WebView webView;
    private BroadcastReceiver mediaActionReceiver;
    private BroadcastReceiver seekReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Request permissions
        requestAppPermissions();

        // WebView setup
        webView = findViewById(R.id.webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        // Keep screen on
        webView.setKeepScreenOn(true);

        // JS bridge
        webView.addJavascriptInterface(new NativeBridge(), "AndroidNativeBridge");

        // WebView client
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Chrome client for mic permission
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        // Load app
        webView.loadUrl("file:///android_asset/index.html");

        // Start MusicService
        startMusicService();

        // Media action receiver (notification buttons)
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaActionReceiver, filter);
        }

        // Seek receiver
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(seekReceiver, seekFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(seekReceiver, seekFilter);
        }
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIF_PERMISSION_CODE);
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    MIC_PERMISSION_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void startMusicService() {
        Intent serviceIntent = new Intent(this, MusicService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // JS Bridge
    public class NativeBridge {

        @JavascriptInterface
        public void updateNotification(String title, String artist, String cover, boolean playing) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("UPDATE_NOTIFICATION");
                intent.putExtra("title", title);
                intent.putExtra("artist", artist);
                intent.putExtra("cover", cover);
                intent.putExtra("playing", playing);
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(intent);
                    } else {
                        startService(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void updateProgress(long positionMs, long durationMs) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("UPDATE_PROGRESS");
                intent.putExtra("position", positionMs);
                intent.putExtra("duration", durationMs);
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(intent);
                    } else {
                        startService(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void stopNotification() {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, MusicService.class);
                intent.setAction("STOP_NOTIFICATION");
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(intent);
                    } else {
                        startService(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show()
            );
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.evaluateJavascript(
                    "(function(){ try { return handleSystemBackPress() ? 'handled' : 'unhandled'; } catch(e) { return 'unhandled'; } })();",
                    value -> {
                        if (value != null && value.contains("unhandled")) {
                            webView.goBack();
                        }
                    }
            );
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (mediaActionReceiver != null) {
            try { unregisterReceiver(mediaActionReceiver); } catch (Exception e) {}
        }
        if (seekReceiver != null) {
            try { unregisterReceiver(seekReceiver); } catch (Exception e) {}
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }
        }
