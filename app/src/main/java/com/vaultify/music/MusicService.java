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
    private Bitmap currentLargeIcon = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForegroundSafely();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!foregroundStarted) startForegroundSafely();

        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            switch (action) {
                case "UPDATE_NOTIFICATION":
                    String newTitle = intent.getStringExtra("title");
                    String newArtist = intent.getStringExtra("artist");
                    String newCover = intent.getStringExtra("cover");

                    boolean coverChanged = newCover != null && !newCover.equals(currentCover);
                    if (coverChanged) {
                        currentLargeIcon = null;
                    }
                    currentTitle = newTitle;
                    currentArtist = newArtist;
                    currentCover = newCover;
                    isPlaying = intent.getBooleanExtra("playing", false);

                    if (coverChanged && currentCover != null && currentCover.startsWith("http")) {
                        loadCoverAndUpdate();
                    } else {
                        updateNotification();
                    }
                    break;
                case "UPDATE_PROGRESS":
                    currentPosition = intent.getLongExtra("position", 0);
                    currentDuration = intent.getLongExtra("duration", 0);
                    // Update only progress bar (less flash)
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
            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(this, CHANNEL_ID);
            } else {
                builder = new Notification.Builder(this);
            }
            builder.setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setPriority(Notification.PRIORITY_LOW);

            startForeground(NOTIFICATION_ID, builder.build());
            foregroundStarted = true;
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Vaultify Music",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Music playback controls");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
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

            // ⚡ Spotify-style MediaStyle
            androidx.media.app.NotificationCompat.MediaStyle mediaStyle =
                new androidx.media.app.NotificationCompat.MediaStyle()
                    .setShowActionsInCompactView(0, 1, 2);

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
                .setStyle(mediaStyle)
                .setColorized(true)
                .setColor(0xFF0D2E35);

            // ⚡ Large album art (thumbnail style like Spotify)
            if (currentLargeIcon != null) {
                builder.setLargeIcon(currentLargeIcon);
            }

            // ⚡ Progress bar with time
            if (currentDuration > 0) {
                int progress = (int) ((currentPosition * 100) / currentDuration);
                builder.setProgress(100, progress, false);
                builder.setSubText(formatTime(currentPosition) + " / " + formatTime(currentDuration));
            }

            // ⚡ Actions
            builder.addAction(android.R.drawable.ic_media_previous, "Prev", prevIntent);
            if (isPlaying) {
                builder.addAction(android.R.drawable.ic_media_pause, "Pause", playPauseIntent);
            } else {
                builder.addAction(android.R.drawable.ic_media_play, "Play", playPauseIntent);
            }
            builder.addAction(android.R.drawable.ic_media_next, "Next", nextIntent);

            Notification notification = builder.build();
            startForeground(NOTIFICATION_ID, notification);
            foregroundStarted = true;
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void loadCoverAndUpdate() {
        final String coverUrl = currentCover;
        if (coverUrl == null || !coverUrl.startsWith("http")) return;

        new Thread(() -> {
            try {
                URL url = new URL(coverUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setDoInput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.connect();
                InputStream input = conn.getInputStream();
                Bitmap bitmap = BitmapFactory.decodeStream(input);
                input.close();

                if (bitmap != null) {
                    // ⚡ Resize to 512x512 (Spotify jaisa thumbnail)
                    int targetSize = 512;
                    if (bitmap.getWidth() > targetSize || bitmap.getHeight() > targetSize) {
                        float scale = Math.min((float) targetSize / bitmap.getWidth(), (float) targetSize / bitmap.getHeight());
                        bitmap = Bitmap.createScaledBitmap(
                            bitmap,
                            (int) (bitmap.getWidth() * scale),
                            (int) (bitmap.getHeight() * scale),
                            true
                        );
                    }
                    currentLargeIcon = bitmap;
                    new android.os.Handler(getMainLooper()).post(this::updateNotification);
                }
            } catch (Exception e) { e.printStackTrace(); }
        }).start();
    }

    private String formatTime(long millis) {
        long totalSec = millis / 1000;
        long min = totalSec / 60;
        long sec = totalSec % 60;
        return String.format("%02d:%02d", min, sec);
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