# Keep WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep MainActivity NativeBridge
-keep class com.vaultify.music.MainActivity$NativeBridge { *; }

# Keep MusicService
-keep class com.vaultify.music.MusicService { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Don't warn
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
