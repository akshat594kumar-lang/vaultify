package com.vaultify.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicService extends Service {
    private static final String CHANNEL_ID = "vaultify_music";
    private static final int NOTIF_ID = 1;

    public static final String ACTION_PLAY = "com.vaultify.music.PLAY";
    public static final String ACTION_PAUSE = "com.vaultify.music.PAUSE";
    public static final String ACTION_NEXT = "com.vaultify.music.NEXT";
    public static final String ACTION_PREV = "com.vaultify.music.PREV";

    private BroadcastReceiver controlReceiver;
    private String currentTitle = "Vaultify";
    private String currentArtist = "Unlimited Soundscape";
    private boolean isPlaying = false;
    private Bitmap currentCover = null;
    private Bitmap defaultCover = null;
    private String lastCoverUrl = "";
    private ExecutorService imageExecutor = Executors.newSingleThreadExecutor();
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        MainActivity.setMusicService(this);
        // Load default cover from mipmap (guaranteed to exist)
        try {
            defaultCover = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            if (defaultCover == null) {
                defaultCover = BitmapFactory.decodeResource(getResources(), R.drawable.ic_launcher_background);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // Try to load vaultify.png from assets (better quality)
        try {
            InputStream is = getAssets().open("vaultify.png");
            Bitmap assetLogo = BitmapFactory.decodeStream(is);
            is.close();
            if (assetLogo != null) {
                defaultCover = assetLogo;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        controlReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (action == null) return;
                String jsAction = null;
                switch (action) {
                    case ACTION_PLAY: jsAction = "onNativePlay()"; isPlaying = true; break;
                    case ACTION_PAUSE: jsAction = "onNativePause()"; isPlaying = false; break;
                    case ACTION_NEXT: jsAction = "onNativeNext()"; break;
                    case ACTION_PREV: jsAction = "onNativePrev()"; break;
                }
                if (jsAction != null) {
                    MainActivity.callJs(jsAction);
                    mainHandler.postDelayed(() -> updateNotification(), 300);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY);
        filter.addAction(ACTION_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_PREV);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(controlReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(controlReceiver, filter);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        updateNotification();
        return START_STICKY;
    }

    public void updateTrackInfo(String title, String artist, String coverUrl, boolean playing) {
        if (title != null && !title.isEmpty()) this.currentTitle = title;
        if (artist != null) this.currentArtist = artist;
        this.isPlaying = playing;

        if (coverUrl != null && !coverUrl.isEmpty() && !coverUrl.equals(lastCoverUrl)) {
            lastCoverUrl = coverUrl;
            loadCoverImage(coverUrl);
        } else {
            updateNotification();
        }
    }

    private void loadCoverImage(String url) {
        if (url == null || url.isEmpty()) {
            updateNotification();
            return;
        }
        
        // If it's a local file or vaultify.png, use default
        if (!url.startsWith("http")) {
            updateNotification();
            return;
        }
        
        imageExecutor.execute(() -> {
            Bitmap bmp = null;
            try {
                URL imageUrl = new URL(url);
                HttpURLConnection conn = (HttpURLConnection) imageUrl.openConnection();
                conn.setDoInput(true);
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36");
                conn.connect();
                InputStream input = conn.getInputStream();
                bmp = BitmapFactory.decodeStream(input);
                input.close();
                conn.disconnect();
            } catch (Exception e) {
                e.printStackTrace();
            }
            final Bitmap finalBmp = bmp;
            mainHandler.post(() -> {
                if (finalBmp != null) {
                    currentCover = finalBmp;
                }
                updateNotification();
            });
        });
    }

    private void updateNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flagsPI = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flagsPI |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentPI = PendingIntent.getActivity(this, 0, openApp, flagsPI);

        PendingIntent playPI = PendingIntent.getBroadcast(this, 1, new Intent(ACTION_PLAY).setPackage(getPackageName()), flagsPI);
        PendingIntent pausePI = PendingIntent.getBroadcast(this, 2, new Intent(ACTION_PAUSE).setPackage(getPackageName()), flagsPI);
        PendingIntent nextPI = PendingIntent.getBroadcast(this, 3, new Intent(ACTION_NEXT).setPackage(getPackageName()), flagsPI);
        PendingIntent prevPI = PendingIntent.getBroadcast(this, 4, new Intent(ACTION_PREV).setPackage(getPackageName()), flagsPI);

        // Pick the best cover available
        Bitmap displayCover;
        if (currentCover != null) {
            displayCover = currentCover;
        } else if (defaultCover != null) {
            displayCover = defaultCover;
        } else {
            displayCover = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(displayCover)
                .setContentIntent(contentPI)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setColor(0xFF8B5CF6)
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Prev", prevPI))
                .addAction(new NotificationCompat.Action(
                        isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        isPlaying ? "Pause" : "Play",
                        isPlaying ? pausePI : playPI))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", nextPI));

        MediaStyle style = new MediaStyle().setShowActionsInCompactView(0, 1, 2);
        builder.setStyle(style);

        Notification notification = builder.build();
        startForeground(NOTIF_ID, notification);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Vaultify Music", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Vaultify music player controls");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try { if (controlReceiver != null) unregisterReceiver(controlReceiver); } catch (Exception e) {}
        try { if (imageExecutor != null) imageExecutor.shutdown(); } catch (Exception e) {}
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}