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

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MusicService extends Service {

    public static final String CHANNEL_ID = "vaultify_playback_channel";
    public static final int NOTIFICATION_ID = 1001;

    private MediaSessionCompat mediaSession;
    private Bitmap currentArtwork = null;
    private String currentTitle = "Vaultify";
    private String currentArtist = "Ready to play";
    private boolean isPlaying = false;
    private long currentPosition = 0;
    private long totalDuration = 0;
    private boolean foregroundStarted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSessionCompat(this, "VaultifySession");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { sendAction("PLAY"); }
            @Override public void onPause() { sendAction("PAUSE"); }
            @Override public void onSkipToNext() { sendAction("NEXT"); }
            @Override public void onSkipToPrevious() { sendAction("PREV"); }
            @Override public void onSeekTo(long pos) {
                Intent intent = new Intent("VAULTIFY_SEEK");
                intent.putExtra("position", pos);
                sendBroadcast(intent);
            }
        });
        mediaSession.setActive(true);
        buildAndShowNotification();
    }

    private void sendAction(String action) {
        Intent intent = new Intent("VAULTIFY_MEDIA_ACTION");
        intent.putExtra("action", action);
        sendBroadcast(intent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Vaultify Playback", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Music playback controls");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("UPDATE_NOTIFICATION".equals(action)) {
                updateNotification(
                    intent.getStringExtra("title"),
                    intent.getStringExtra("artist"),
                    intent.getStringExtra("cover"),
                    intent.getBooleanExtra("playing", false));
            } else if ("UPDATE_PROGRESS".equals(action)) {
                updateProgress(intent.getLongExtra("position", 0),
                               intent.getLongExtra("duration", 0));
            } else if ("STOP_NOTIFICATION".equals(action)) {
                stopForeground(true);
                foregroundStarted = false;
                NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (manager != null) manager.cancel(NOTIFICATION_ID);
                stopSelf();
            } else {
                buildAndShowNotification();
            }
        }
        return START_STICKY;
    }

    public void updateNotification(String title, String artist, String artworkUrl, boolean playing) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "Vaultify";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Ready to play";
        this.isPlaying = playing;

        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            new Thread(() -> {
                Bitmap bmp = loadBitmapFromUrl(artworkUrl);
                if (bmp != null) currentArtwork = bmp;
                buildAndShowNotification();
            }).start();
        } else {
            buildAndShowNotification();
        }
    }

    public void updateProgress(long positionMs, long durationMs) {
        this.currentPosition = positionMs;
        this.totalDuration = durationMs;
        if (mediaSession != null) {
            PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY |
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_SEEK_TO)
                .setState(isPlaying ? PlaybackStateCompat.STATE_PLAYING :
                        PlaybackStateCompat.STATE_PAUSED, positionMs, 1.0f)
                .build();
            mediaSession.setPlaybackState(state);
        }
    }

    private void buildAndShowNotification() {
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentPending = PendingIntent.getActivity(this, 0, contentIntent, piFlags);

        PendingIntent prevPending = PendingIntent.getBroadcast(this, 1,
                new Intent("VAULTIFY_MEDIA_ACTION").putExtra("action", "PREV"), piFlags);

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause :
                android.R.drawable.ic_media_play;
        String playPauseAction = isPlaying ? "PAUSE" : "PLAY";
        PendingIntent playPausePending = PendingIntent.getBroadcast(this, 2,
                new Intent("VAULTIFY_MEDIA_ACTION").putExtra("action", playPauseAction), piFlags);

        PendingIntent nextPending = PendingIntent.getBroadcast(this, 3,
                new Intent("VAULTIFY_MEDIA_ACTION").putExtra("action", "NEXT"), piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setContentIntent(contentPending)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(isPlaying)
            .setSilent(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPending)
            .addAction(playPauseIcon, isPlaying ? "Pause" : "Play", playPausePending)
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending);

        try {
            androidx.media.app.NotificationCompat.MediaStyle style =
                new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(style);
        } catch (Exception e) {}

        if (currentArtwork != null) builder.setLargeIcon(currentArtwork);
        else {
            try { builder.setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher)); }
            catch (Exception e) {}
        }

        Notification notification = builder.build();

        if (mediaSession != null) {
            mediaSession.setMetadata(new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, totalDuration)
                .build());
        }

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            if (!foregroundStarted) {
                startForeground(NOTIFICATION_ID, notification);
                foregroundStarted = true;
            } else {
                manager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private Bitmap loadBitmapFromUrl(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.connect();
            InputStream input = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(input);
            input.close();
            conn.disconnect();
            return bmp;
        } catch (Exception e) { return null; }
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (mediaSession != null) mediaSession.release();
        super.onDestroy();
    }
}
