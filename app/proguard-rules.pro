-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class com.vaultify.music.MainActivity$NativeBridge { *; }
-keep class com.vaultify.music.MusicService { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
