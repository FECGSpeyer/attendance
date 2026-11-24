# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Attendix: Keep-Regeln für R8 (minifyEnabled true) ---

# Eigene native Klassen im liveplan-Package.
# LivePlanMessagingService wird im AndroidManifest als <service> referenziert,
# LiveActivityPlugin als Capacitor-Plugin per Reflection instanziiert.
-keep class io.stephanus.attendix.liveplan.** { *; }
-keep class io.stephanus.attendix.MainActivity { *; }

# Capacitor-Plugins werden über Reflection geladen.
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}

# Capacitor nutzt @JavascriptInterface für die WebView-Bridge.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
