package io.hdsinterlude.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowEdgePolicyTest {
    @Test fun convertsPhysicalInsetsToCssPixelsUsingLocaleInvariantFormatting() {
        assertEquals("0px", WindowEdgePolicy.formatCssPx(0, 3.0f))
        assertEquals("0px", WindowEdgePolicy.formatCssPx(-12, 3.0f))
        assertEquals("36px", WindowEdgePolicy.formatCssPx(108, 3.0f))
        assertEquals("27.27px", WindowEdgePolicy.formatCssPx(75, 2.75f))
        assertEquals("48px", WindowEdgePolicy.formatCssPx(48, 0f))
    }

    @Test fun containerPaddingRemainsZeroForSystemBarsAndOnlyOffsetsVisibleIme() {
        // 手势条或三键导航栏存在但键盘未弹出时，父容器不加底部 padding，交由 WebView 全屏铺满壁纸
        assertEquals(0, WindowEdgePolicy.containerBottomPadding(0, false, 0))
        assertEquals(0, WindowEdgePolicy.containerBottomPadding(0, false, 126))
        // 键盘弹出时独立垫起软键盘高度
        assertEquals(820, WindowEdgePolicy.containerBottomPadding(0, true, 820))
        assertEquals(832, WindowEdgePolicy.containerBottomPadding(12, true, 820))
    }

    @Test fun viewportScriptInjectsAllFourSafeAreaVariablesAndImeClass() {
        val script = WindowEdgePolicy.buildViewportScript(36, 108, 0, 60, 3.0f, false)
        assertTrue(script.contains("'--safe-top','36px'"))
        assertTrue(script.contains("'--safe-right','0px'"))
        assertTrue(script.contains("'--safe-bottom','20px'"))
        assertTrue(script.contains("'--safe-left','12px'"))
        assertTrue(script.contains("classList.toggle('ime-visible',false)"))
    }

    @Test fun resolvesSystemBarAppearanceFromWallpaperAppThemeAndSystemMode() {
        // 应用内显式浅色/深色优先于系统夜间模式
        assertFalse(WindowEdgePolicy.resolveDarkChrome("light", systemDark = true, wallpaperIsDark = null))
        assertTrue(WindowEdgePolicy.resolveDarkChrome("dark", systemDark = false, wallpaperIsDark = null))
        assertTrue(WindowEdgePolicy.resolveDarkChrome("system", systemDark = true, wallpaperIsDark = null))
        assertFalse(WindowEdgePolicy.resolveDarkChrome("system", systemDark = false, wallpaperIsDark = null))
        // 高不透明度自定义壁纸的实际顶部明暗优先决定状态栏图标可读性
        assertFalse(WindowEdgePolicy.resolveDarkChrome("dark", systemDark = true, wallpaperIsDark = false))
        assertTrue(WindowEdgePolicy.resolveDarkChrome("light", systemDark = false, wallpaperIsDark = true))
        // 冷启动兜底底色对齐新版液态玻璃明暗色板
        assertEquals("#f4f6fb", WindowEdgePolicy.chromeFallbackColorHex(false))
        assertEquals("#0f141d", WindowEdgePolicy.chromeFallbackColorHex(true))
    }
}
