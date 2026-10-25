package io.hdsinterlude.android;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HdsRuntimePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        // Use the same WebView bridge as the viewport integration below. The UI
        // consumes Inbox layers first and knows whether its root came from a tab.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript(
                    "Boolean(window.hdsHandleBack && window.hdsHandleBack())", result -> {
                        if (!"true".equals(result)) {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    });
            }
        });
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        // Own system bars/cutout here; Capacitor's CONSUMED listener is disabled in config.
        View container = (View) bridge.getWebView().getParent();
        final int left = container.getPaddingLeft(), top = container.getPaddingTop();
        final int right = container.getPaddingRight(), bottom = container.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, windowInsets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = windowInsets.getInsets(types);
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(left + bars.left, top + bars.top, right + bars.right,
                bottom + Math.max(bars.bottom, ime.bottom));
            // Keep IME information for WebView viewport updates; zero only our bar types.
            bridge.getWebView().evaluateJavascript("document.documentElement.classList.toggle('ime-visible', "
                + windowInsets.isVisible(WindowInsetsCompat.Type.ime()) + ");", null);
            view.post(() -> {
                org.json.JSONObject layout = new org.json.JSONObject();
                try {
                    layout.put("timestamp", java.time.Instant.now().toString());
                    layout.put("bars", new org.json.JSONArray(new int[] {bars.left, bars.top, bars.right, bars.bottom}));
                    layout.put("imeBottom", ime.bottom);
                    layout.put("webViewWidth", bridge.getWebView().getWidth());
                    layout.put("webViewHeight", bridge.getWebView().getHeight());
                    layout.put("padding", new org.json.JSONArray(new int[] {view.getPaddingLeft(), view.getPaddingTop(), view.getPaddingRight(), view.getPaddingBottom()}));
                    HdsRuntime.get(this).recordInsets(layout);
                } catch (org.json.JSONException ignored) { }
            });
            return new WindowInsetsCompat.Builder(windowInsets).setInsets(types, Insets.NONE)
                .setInsetsIgnoringVisibility(types, Insets.NONE).build();
        });
        updateSystemBars(container);
        ViewCompat.requestApplyInsets(container);
    }
    @Override public void onResume() {
        super.onResume();
        AppVisibility.setForeground(true);
        HdsService.refreshPowerPolicy();
    }
    @Override public void onPause() {
        AppVisibility.setForeground(false);
        HdsService.noteActivity();
        super.onPause();
    }
    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
    private void updateSystemBars(View container) {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        container.setBackgroundColor(Color.parseColor(dark ? "#20241f" : "#f5f3ed"));
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), container);
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (bridge != null) {
            View container = (View) bridge.getWebView().getParent();
            updateSystemBars(container);
            ViewCompat.requestApplyInsets(container);
        }
    }
}
