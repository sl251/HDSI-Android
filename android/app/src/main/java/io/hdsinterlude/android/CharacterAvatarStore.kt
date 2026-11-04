package io.hdsinterlude.android

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONObject
import java.io.File

/** Story-local chat/feed avatar, independent of the character's image-generation references. */
class CharacterAvatarStore(private val context: Context, private val store: HdsStore = HdsStore(context)) {
    private fun target(cardId: String): File {
        require(cardId.isNotBlank() && cardId == store.publicSettings().optString("activeCard")) { "角色已切换，请重新打开头像设置" }
        return File(store.profile(), "character-avatar.jpg")
    }
    fun read(cardId: String): JSONObject {
        val file = target(cardId)
        return JSONObject().put("cardId", cardId).apply {
            if (file.isFile) put("path", file.absolutePath).put("revision", file.lastModified())
        }
    }
    fun save(input: JSONObject): JSONObject {
        val cardId = input.getString("cardId")
        val file = target(cardId)
        if (input.optBoolean("clear")) { AtomicFile(file).delete(); return read(cardId) }
        val sourceId = input.optString("imageId")
        val temporary = if (sourceId.isEmpty()) File.createTempFile("hds-avatar-", ".jpg", context.cacheDir) else null
        try {
            val source = if (sourceId.isNotEmpty()) {
                require(sourceId.matches(Regex("[a-f0-9]{64}"))) { "头像图片编号无效" }
                val root = File(store.profile(), "images").canonicalFile
                listOf("jpg", "png", "webp", "gif").map { File(root, "$sourceId.$it") }
                    .firstOrNull { it.isFile && it.canonicalFile.parentFile == root && it.length() <= 16 * 1024 * 1024 }
                    ?: throw IllegalArgumentException("生成的头像不存在于当前故事")
            } else {
                val data = input.optString("dataUri")
                require(data.length <= 700000 && data.startsWith("data:image/jpeg;base64,")) { "头像格式无效，请重新选择图片" }
                temporary!!.writeBytes(Base64.decode(data.substringAfter(','), Base64.DEFAULT)); temporary
            }
            val normalized = AppearanceStore(context).image(Uri.fromFile(source))
            val bytes = Base64.decode(normalized.substringAfter(','), Base64.DEFAULT)
            val atomic = AtomicFile(file); val output = atomic.startWrite()
            try { output.write(bytes); atomic.finishWrite(output) } catch (error: Throwable) { atomic.failWrite(output); throw error }
        } finally { temporary?.delete() }
        return read(cardId)
    }
}
