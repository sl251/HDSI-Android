package io.hdsinterlude.android;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import android.os.Build;
import android.os.Bundle;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    private String lastViewportScript = "";
    private String appTheme = "system";
    private Boolean wallpaperIsDark = null;

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HdsRuntimePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        try {
            appTheme = new AppearanceStore(this).read().optString("theme", "system");
        } catch (Exception ignored) { }

        // 与前端共用返回栈：优先消费应用内弹窗、抽屉与空间子页
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

        configureEdgeToEdgeWindow(getWindow());
        WebView webView = bridge.getWebView();
        webView.setBackgroundColor(Color.TRANSPARENT);
        View container = (View) webView.getParent();
        final int left = container.getPaddingLeft(), top = container.getPaddingTop();
        final int right = container.getPaddingRight(), bottom = container.getPaddingBottom();

        // 页面开始加载或重载完成时重放最新安全区变量，防止新 documentElement 丢失内联变量
        bridge.addWebViewListener(new WebViewListener() {
            @Override public void onPageStarted(WebView view) { applyViewportScript(view); }
            @Override public void onPageLoaded(WebView view) { applyViewportScript(view); }
        });

        // 系统状态栏/导航栏/挖孔交由 WebView CSS 安全区避让，使壁纸铺满物理屏幕四边；父容器仅在软键盘弹出时垫高底部
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, windowInsets) -> {
            int barTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = windowInsets.getInsets(barTypes);
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0;
            float density = getResources().getDisplayMetrics().density;

            view.setPadding(
                left,
                top,
                right,
                WindowEdgePolicy.containerBottomPadding(bottom, imeVisible, ime.bottom)
            );

            lastViewportScript = WindowEdgePolicy.buildViewportScript(
                bars.left, bars.top, bars.right, bars.bottom, density, imeVisible
            );
            applyViewportScript(bridge.getWebView());

            view.post(() -> {
                org.json.JSONObject layout = new org.json.JSONObject();
                try {
                    layout.put("timestamp", java.time.Instant.now().toString());
                    layout.put("edgeToEdge", true);
                    layout.put("density", density);
                    layout.put("bars", new org.json.JSONArray(new int[] {bars.left, bars.top, bars.right, bars.bottom}));
                    layout.put("safeCssPx", new org.json.JSONArray(new String[] {
                        WindowEdgePolicy.formatCssPx(bars.top, density),
                        WindowEdgePolicy.formatCssPx(bars.right, density),
                        WindowEdgePolicy.formatCssPx(bars.bottom, density),
                        WindowEdgePolicy.formatCssPx(bars.left, density)
                    }));
                    layout.put("imeVisible", imeVisible);
                    layout.put("imeBottom", ime.bottom);
                    layout.put("webViewWidth", bridge.getWebView().getWidth());
                    layout.put("webViewHeight", bridge.getWebView().getHeight());
                    layout.put("padding", new org.json.JSONArray(new int[] {
                        view.getPaddingLeft(), view.getPaddingTop(), view.getPaddingRight(), view.getPaddingBottom()
                    }));
                    HdsRuntime.get(this).recordInsets(layout);
                } catch (org.json.JSONException ignored) { }
            });

            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(barTypes, Insets.NONE)
                .setInsetsIgnoringVisibility(barTypes, Insets.NONE)
                .build();
        });

        updateSystemBars(container);
        ViewCompat.requestApplyInsets(container);
    }

    @SuppressWarnings("deprecation")
    private void configureEdgeToEdgeWindow(Window window) {
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
    }

    private void applyViewportScript(WebView webView) {
        if (webView == null || lastViewportScript == null || lastViewportScript.isEmpty()) return;
        webView.evaluateJavascript(lastViewportScript, null);
    }

    public void syncSystemBarAppearance(String nextTheme, Boolean nextWallpaperIsDark) {
        if (nextTheme != null && !nextTheme.isEmpty()) {
            appTheme = nextTheme;
        }
        wallpaperIsDark = nextWallpaperIsDark;
        if (bridge != null && bridge.getWebView() != null) {
            View container = (View) bridge.getWebView().getParent();
            if (container != null) updateSystemBars(container);
        }
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
        boolean systemDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = WindowEdgePolicy.resolveDarkChrome(appTheme, systemDark, wallpaperIsDark);
        int fallbackColor = Color.parseColor(WindowEdgePolicy.chromeFallbackColorHex(dark));
        getWindow().getDecorView().setBackgroundColor(fallbackColor);
        container.setBackgroundColor(fallbackColor);
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
