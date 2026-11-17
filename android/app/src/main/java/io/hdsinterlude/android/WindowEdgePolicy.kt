package io.hdsinterlude.android

import java.util.Locale
import kotlin.math.roundToInt

/**
 * 统一管理 Edge-to-Edge 全屏绘制策略：
 * 1. 系统状态栏、手势导航栏与屏幕挖孔由 WebView CSS 安全区变量承接，父容器不再收缩上下左右内边距，使壁纸与毛玻璃真正铺满物理屏幕四边。
 * 2. 软键盘（IME）弹出时由原生父容器底部独立避让，并在前端标记 ime-visible 以归零底部安全区，避免双重留白。
 * 3. 系统栏图标明暗色与冷启动兜底底色跟随应用内主题及高不透明度壁纸亮度动态切换。
 */
object WindowEdgePolicy {
    const val LIGHT_PAPER_HEX = "#f4f6fb"
    const val DARK_PAPER_HEX = "#0f141d"

    @JvmStatic
    fun pxToCssPx(px: Int, density: Float): Float {
        if (px <= 0) return 0f
        val safeDensity = if (density > 0f && density.isFinite()) density else 1f
        return ((px.toFloat() / safeDensity) * 100f).roundToInt() / 100f
    }

    @JvmStatic
    fun formatCssPx(px: Int, density: Float): String {
        val value = pxToCssPx(px, density)
        if (value <= 0f) return "0px"
        val asInt = value.roundToInt()
        return if (kotlin.math.abs(value - asInt) < 0.005f) {
            "${asInt}px"
        } else {
            String.format(Locale.US, "%.2fpx", value).replace(Regex("\\.?0+px$"), "px")
        }
    }

    @JvmStatic
    fun containerBottomPadding(baseBottom: Int, imeVisible: Boolean, imeBottom: Int): Int {
        val keyboard = if (imeVisible && imeBottom > 0) imeBottom else 0
        return baseBottom + keyboard
    }

    @JvmStatic
    fun buildViewportScript(
        barsLeft: Int,
        barsTop: Int,
        barsRight: Int,
        barsBottom: Int,
        density: Float,
        imeVisible: Boolean,
    ): String {
        val top = formatCssPx(barsTop, density)
        val right = formatCssPx(barsRight, density)
        val bottom = formatCssPx(barsBottom, density)
        val left = formatCssPx(barsLeft, density)
        return "(()=>{const r=document.documentElement;" +
            "r.style.setProperty('--safe-top','$top');" +
            "r.style.setProperty('--safe-right','$right');" +
            "r.style.setProperty('--safe-bottom','$bottom');" +
            "r.style.setProperty('--safe-left','$left');" +
            "r.classList.toggle('ime-visible',$imeVisible);})();"
    }

    @JvmStatic
    fun resolveDarkChrome(appTheme: String?, systemDark: Boolean, wallpaperIsDark: Boolean? = null): Boolean {
        if (wallpaperIsDark != null) return wallpaperIsDark
        return when (appTheme) {
            "dark" -> true
            "light" -> false
            else -> systemDark
        }
    }

    @JvmStatic
    fun chromeFallbackColorHex(isDark: Boolean): String = if (isDark) DARK_PAPER_HEX else LIGHT_PAPER_HEX
}
