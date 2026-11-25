package io.stephanus.attendix;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import io.stephanus.attendix.liveplan.LiveActivityPlugin;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private int lastNavOverlapDp = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before super.onCreate.
        registerPlugin(LiveActivityPlugin.class);
        super.onCreate(savedInstanceState);
        installNavigationBarOverlapFix();
    }

    /**
     * Capacitor's SystemBars plugin either pads the WebView natively or passes the
     * insets on as CSS, depending on the WebView version and the plugin version the
     * APK was built with. On some devices (e.g. Huawei with 3-button navigation)
     * neither happens while the window still draws behind the navigation bar, so the
     * tab bar ends up under the back/home/recents buttons.
     *
     * Independent of that logic we measure how far the WebView actually reaches into
     * the navigation bar and hand that to CSS as --attendix-nav-inset-bottom
     * (see global.scss). If the plugin already handled it, the overlap is 0.
     */
    private void installNavigationBarOverlapFix() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.getViewTreeObserver().addOnGlobalLayoutListener(this::updateNavigationBarOverlap);
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    // A (re)loaded page loses the inline style, so inject again.
                    lastNavOverlapDp = -1;
                    updateNavigationBarOverlap();
                }
            }
        );
    }

    private void updateNavigationBarOverlap() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        View decorView = getWindow().getDecorView();
        if (webView == null || webView.getHeight() == 0 || decorView.getHeight() == 0) {
            return;
        }
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
        if (insets == null) {
            return;
        }

        int navBottom = Math.max(
            insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom,
            legacyNavigationBarHeight(decorView)
        );
        int[] location = new int[2];
        webView.getLocationInWindow(location);
        int webViewBottom = location[1] + webView.getHeight();
        int overlapPx = Math.max(0, webViewBottom - (decorView.getHeight() - navBottom));

        float density = getResources().getDisplayMetrics().density;
        int overlapDp = Math.round(overlapPx / density);
        if (overlapDp == lastNavOverlapDp) {
            return;
        }
        lastNavOverlapDp = overlapDp;

        String script = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--attendix-nav-inset-bottom', '%dpx');",
            overlapDp
        );
        webView.evaluateJavascript(script, null);
    }

    /**
     * Before Android 11, androidx derives the navigation bar inset from the stable
     * insets. Huawei/EMUI with a hideable 3-button bar reports a stable bottom inset
     * of 0, so navigationBars() is 0 although the bar covers the page (and Capacitor's
     * SystemBars sees 0 as well). Here we read the raw system window inset and the
     * visible display frame instead, both computed by the window manager, and cap
     * them at the navigation bar height so an open keyboard is not counted.
     */
    @SuppressWarnings("deprecation")
    private int legacyNavigationBarHeight(View decorView) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return 0;
        }
        int result = 0;

        WindowInsets raw = decorView.getRootWindowInsets();
        if (raw != null) {
            result = Math.max(result, raw.getSystemWindowInsetBottom());
        }

        Rect visible = new Rect();
        decorView.getWindowVisibleDisplayFrame(visible);
        int[] decorOnScreen = new int[2];
        decorView.getLocationOnScreen(decorOnScreen);
        int windowBottom = decorOnScreen[1] + decorView.getHeight();
        if (!visible.isEmpty()) {
            result = Math.max(result, windowBottom - visible.bottom);
        }

        return Math.max(0, Math.min(result, navigationBarCap()));
    }

    private int navigationBarCap() {
        int resId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        if (resId > 0) {
            int height = getResources().getDimensionPixelSize(resId);
            if (height > 0) {
                return height;
            }
        }
        return Math.round(56 * getResources().getDisplayMetrics().density);
    }
}
