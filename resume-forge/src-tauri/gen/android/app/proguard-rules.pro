# ── Tauri ─────────────────────────────────────────────────────────────────────
# Tauri loads its Rust JNI bridge by reflection — keep all of its classes.
-keep class app.tauri.** { *; }
-keep class com.jules.resume_forge.** { *; }

# Keep native methods (Rust JNI surface).
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── WebView / JavaScript bridge ───────────────────────────────────────────────
-keep class * extends android.webkit.WebViewClient
-keep class * extends android.webkit.WebChromeClient
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Reflection metadata (Kotlin, generics, annotations) ───────────────────────
-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*
-keep class kotlin.Metadata { *; }

# ── Crash readability ─────────────────────────────────────────────────────────
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
