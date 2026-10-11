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
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class MusicService extends Service {
    private static final String CHANNEL_ID = "vaultify_music";
    private static final int NOTIF_ID = 1;

    public static final String ACTION_PLAY = "com.vaultify.music.PLAY";
    public static final String ACTION_PAUSE = "com.vaultify.music.PAUSE";
    public static final String ACTION_NEXT = "com.vaultify.music.NEXT";
    public static final String ACTION_PREV = "com.vaultify.music.PREV";

    private BroadcastReceiver controlReceiver;
    private String currentTitle = "Vaultify";
    private String currentArtist = "Music ready";
    private boolean isPlaying = false;
    private Bitmap currentCover = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();

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
                    updateNotification();
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
        this.currentTitle = title != null ? title : "Vaultify";
        this.currentArtist = artist != null ? artist : "";
        this.isPlaying = playing;
        updateNotification();
    }

    private void updateNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flagsPI = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flagsPI |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentPI = PendingIntent.getActivity(this, 0, openApp, flagsPI);

        PendingIntent playPI = PendingIntent.getBroadcast(this, 1,
                new Intent(ACTION_PLAY).setPackage(getPackageName()), flagsPI);
        PendingIntent pausePI = PendingIntent.getBroadcast(this, 2,
                new Intent(ACTION_PAUSE).setPackage(getPackageName()), flagsPI);
        PendingIntent nextPI = PendingIntent.getBroadcast(this, 3,
                new Intent(ACTION_NEXT).setPackage(getPackageName()), flagsPI);
        PendingIntent prevPI = PendingIntent.getBroadcast(this, 4,
                new Intent(ACTION_PREV).setPackage(getPackageName()), flagsPI);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentPI)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(new NotificationCompat.Action(
                        isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        isPlaying ? "Pause" : "Play",
                        isPlaying ? pausePI : playPI))
                .addAction(new NotificationCompat.Action(
                        android.R.drawable.ic_media_next, "Next", nextPI));

        MediaStyle style = new MediaStyle()
                .setShowActionsInCompactView(0, 1);
        builder.setStyle(style);

        if (currentCover != null) {
            builder.setLargeIcon(currentCover);
        } else {
            Bitmap bm = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            if (bm != null) builder.setLargeIcon(bm);
        }

        Notification notification = builder.build();
        startForeground(NOTIF_ID, notification);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Music Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Vaultify music controls");
            channel.setSound(null, null);
            channel.enableVibration(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try { if (controlReceiver != null) unregisterReceiver(controlReceiver); } catch (Exception e) {}
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
