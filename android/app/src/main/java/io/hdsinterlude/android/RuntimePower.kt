package io.hdsinterlude.android

import android.content.Context
import org.json.JSONObject

/** Uses elapsed time so wall-clock changes cannot extend a background lease. */
internal class WakePolicy {
    private var workUntil = 0L
    fun activity(now: Long) { workUntil = now + 10 * 60_000L }
    fun timeout(mode: String, foreground: Boolean, now: Long): Long =
        if (mode == "continuous" || foreground) 90_000L else (workUntil - now).coerceIn(0L, 90_000L)
}

internal class RuntimePower(context: Context) {
    private val preferences = context.getSharedPreferences("runtime-power", Context.MODE_PRIVATE)
    // Preserve existing background delivery behavior until the user chooses otherwise.
    fun mode(): String = preferences.getString("mode", "continuous") ?: "continuous"
    fun read(): JSONObject = JSONObject().put("mode", mode())
    fun save(mode: String): JSONObject {
        require(mode in listOf("continuous", "balanced")) { "无效后台模式" }
        check(preferences.edit().putString("mode", mode).commit()) { "后台模式保存失败" }
        HdsService.refreshPowerPolicy()
        return read()
    }
}
