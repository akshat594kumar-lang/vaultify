package com.vaultify.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MusicService extends Service {

    private static final String CHANNEL_ID = "vaultify_music_channel";
    private static final int NOTIFICATION_ID = 1001;

    private String currentTitle = "Vaultify";
    private String currentArtist = "Ready to play";
    private String currentCover = "";
    private boolean isPlaying = false;
    private long currentPosition = 0;
    private long currentDuration = 0;
    private boolean foregroundStarted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        // ⚡ CRITICAL: Start as foreground IMMEDIATELY to avoid timeout crash
        startForegroundSafely();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // ⚡ CRITICAL: Always call startForeground first thing
        if (!foregroundStarted) {
            startForegroundSafely();
        }

        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            switch (action) {
                case "UPDATE_NOTIFICATION":
                    currentTitle = intent.getStringExtra("title");
                    currentArtist = intent.getStringExtra("artist");
                    currentCover = intent.getStringExtra("cover");
                    isPlaying = intent.getBooleanExtra("playing", false);
                    updateNotification();
                    break;
                case "UPDATE_PROGRESS":
                    currentPosition = intent.getLongExtra("position", 0);
                    currentDuration = intent.getLongExtra("duration", 0);
                    updateNotification();
                    break;
                case "STOP_NOTIFICATION":
                    stopForeground(true);
                    foregroundStarted = false;
                    stopSelf();
                    break;
            }
        }
        return START_STICKY;
    }

    private void startForegroundSafely() {
        try {
            // Create minimal notification immediately
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle(currentTitle != null ? currentTitle : "Vaultify")
                    .setContentText(currentArtist != null ? currentArtist : "Ready")
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setOngoing(true)
                    .setPriority(Notification.PRIORITY_LOW);
                startForeground(NOTIFICATION_ID, builder.build());
            } else {
                NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle(currentTitle != null ? currentTitle : "Vaultify")
                    .setContentText(currentArtist != null ? currentArtist : "Ready")
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setOngoing(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW);
                startForeground(NOTIFICATION_ID, builder.build());
            }
            foregroundStarted = true;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Vaultify Music", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Music playback controls");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void updateNotification() {
        try {
            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, piFlags);

            PendingIntent prevIntent = buildActionPendingIntent("PREV", 1);
            PendingIntent playPauseIntent = buildActionPendingIntent(isPlaying ? "PAUSE" : "PLAY", 2);
            PendingIntent nextIntent = buildActionPendingIntent("NEXT", 3);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle != null ? currentTitle : "Vaultify")
                .setContentText(currentArtist != null ? currentArtist : "")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pendingIntent)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_previous, "Prev", prevIntent)
                .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "Pause" : "Play", playPauseIntent)
                .addAction(android.R.drawable.ic_media_next, "Next", nextIntent);

            if (currentDuration > 0) {
                builder.setProgress(100, (int) ((currentPosition * 100) / currentDuration), false);
            }

            Notification notification = builder.build();

            // ⚡ Always update foreground — never just notify
            startForeground(NOTIFICATION_ID, notification);
            foregroundStarted = true;

            // Try to load cover art in background
            if (currentCover != null && currentCover.startsWith("http")) {
                final String coverUrl = currentCover;
                new Thread(() -> {
                    try {
                        URL url = new URL(coverUrl);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setDoInput(true);
                        conn.setConnectTimeout(5000);
                        conn.setReadTimeout(5000);
                        conn.connect();
                        InputStream input = conn.getInputStream();
                        Bitmap bitmap = BitmapFactory.decodeStream(input);
                        input.close();
                        if (bitmap != null) {
                            builder.setLargeIcon(bitmap);
                            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                            if (manager != null) manager.notify(NOTIFICATION_ID, builder.build());
                        }
                    } catch (Exception e) {}
                }).start();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private PendingIntent buildActionPendingIntent(String action, int reqCode) {
        Intent intent = new Intent("VAULTIFY_MEDIA_ACTION");
        intent.putExtra("action", action);
        intent.setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(this, reqCode, intent, flags);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}
