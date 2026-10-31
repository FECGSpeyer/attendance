package io.stephanus.attendix;

import android.os.Bundle;
import android.view.View;
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

        int navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
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
}
