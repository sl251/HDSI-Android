package io.hdsinterlude.android

import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Only the selected profile and its card are included. No credentials or shared QQ directory. */
class StoryArchive(private val base: File, private val limits: Limits = Limits()) {
    data class Limits(val fileBytes: Long = 512L * 1024 * 1024, val totalBytes: Long = 1024L * 1024 * 1024, val entries: Int = 10000, val manifestBytes: Long = 2L * 1024 * 1024)
    private val journal = File(base, "story-operation.json")
    private fun hash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val block = ByteArray(65536); while (true) { val count = input.read(block); if (count < 0) break; digest.update(block, 0, count) } }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    private fun current(id: String): File { require(id.matches(Regex("[a-f0-9]{64}"))) { "角色编号无效" }; return File(base, "profiles/$id") }
    private fun card(id: String) = File(base, "cards/$id.json")
    private fun source(id: String) = File(base, "cards/$id.source")
    private fun writeSource(id: String, from: File) {
        require(from.isFile && !Files.isSymbolicLink(from.toPath())) { "角色卡原件不存在或包含链接" }
        val temporary = File(base, "cards/$id.source.restore.tmp")
        temporary.outputStream().use { stream -> from.inputStream().use { it.copyTo(stream) }; stream.fd.sync() }
        Files.move(temporary.toPath(), source(id).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
    }
    private fun writeCard(id: String, bytes: ByteArray) {
        val temporary = File(base, "cards/$id.restore.tmp")
        temporary.outputStream().use { stream -> stream.write(bytes); stream.fd.sync() }
        Files.move(temporary.toPath(), card(id).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
    }
    private fun exportFiles(id: String): LinkedHashMap<String, File> {
        val profile = current(id); require(File(profile, "hds.sqlite").isFile) { "当前角色尚无故事存档" }
        val files = linkedMapOf("card.json" to card(id), "card.source" to File(base, "cards/$id.source"))
        profile.walkTopDown().forEach { file ->
            require(!Files.isSymbolicLink(file.toPath())) { "存档包含符号链接，无法导出" }
            if (file.isFile) files["profile/" + file.relativeTo(profile).invariantSeparatorsPath] = file
        }
        require(files.size + 1 <= limits.entries) { "存档文件过多，超过可恢复的条目上限" }
        var total = 0L
        for ((name, file) in files) {
            require(file.isFile && !Files.isSymbolicLink(file.toPath())) { "存档文件不存在或包含链接" }
            require(name.length <= 512 && !name.contains('\\') && !name.contains(':') && name.split('/').none { it.isEmpty() || it == "." || it == ".." }) { "存档路径无效" }
            total += file.length()
            require(file.length() <= limits.fileBytes && total <= limits.totalBytes) { "存档超过可恢复的大小上限，请保留应用数据" }
        }
        require(card(id).length() <= 6 * 1024 * 1024) { "角色卡元数据过大" }
        return files
    }
    /** The destination is opened only after all recovery limits and metadata have been checked. */
    fun exportTo(id: String, openOutput: () -> OutputStream) {
        val files = exportFiles(id)
        val manifest = JSONObject().put("format", 2).put("dataSchema", 1).put("cardId", id).put("hds", BuildConfig.HDS_VERSION).put("app", BuildConfig.VERSION_NAME).put("createdAt", java.time.Instant.now().toString())
        val checksums = JSONObject(); for ((name, file) in files) { require(file.isFile); checksums.put(name, hash(file)) }; manifest.put("sha256", checksums)
        val metadata = manifest.toString().toByteArray(Charsets.UTF_8)
        require(metadata.size.toLong() <= minOf(limits.fileBytes, limits.manifestBytes) && files.values.sumOf { it.length() } + metadata.size <= limits.totalBytes) { "存档清单或总大小超过可恢复上限" }
        ZipOutputStream(openOutput()).use { zip ->
            zip.putNextEntry(ZipEntry("manifest.json")); zip.write(metadata); zip.closeEntry()
            for ((name, file) in files) { zip.putNextEntry(ZipEntry(name)); file.inputStream().use { it.copyTo(zip) }; zip.closeEntry() }
        }
    }
    fun export(id: String, output: OutputStream) = exportTo(id) { output }
    fun stage(id: String, input: InputStream): File {
        current(id)
        val stage = File(base, "story-staging/${UUID.randomUUID()}").apply { mkdirs() }
        try {
            val seen = HashSet<String>(); var total = 0L
            ZipInputStream(input).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break; val name = entry.name
                    require(!entry.isDirectory && seen.add(name) && seen.size <= limits.entries && name.length <= 512) { "存档条目无效或重复" }
                    require(name in listOf("manifest.json", "card.json", "card.source") || name.startsWith("profile/")) { "存档包含未知条目" }
                    require(!name.contains('\\') && name.split('/').none { it == ".." || it == "." || it.isEmpty() } && !name.contains(':')) { "存档路径无效" }
                    val target = File(stage, name).canonicalFile
                    require(target.toPath().startsWith(stage.canonicalFile.toPath())) { "存档路径越界" }
                    target.parentFile.mkdirs(); target.outputStream().use { out ->
                        val block = ByteArray(65536); var size = 0L
                        while (true) { val count = zip.read(block); if (count < 0) break; size += count; total += count; require(size <= limits.fileBytes && total <= limits.totalBytes && (name != "manifest.json" || size <= limits.manifestBytes)) { "存档超过大小限制" }; out.write(block, 0, count) }
                    }
                    zip.closeEntry()
                }
            }
            val metadata = File(stage, "manifest.json"); require(metadata.length() <= limits.manifestBytes) { "清单过大" }
            val manifest = JSONObject(metadata.readText())
            require(manifest.getString("cardId") == id) { "请选择当前角色的存档" }
            val compatible = when (manifest.getInt("format")) {
                // Pre-9.7 exports used rc51 as a fixed label, including rc56/57 data.
                1 -> manifest.optString("hds") == "1.0.1-rc51"
                2 -> manifest.optInt("dataSchema") == 1 && manifest.optString("hds") == BuildConfig.HDS_VERSION
                else -> false
            }
            require(compatible) { "存档格式或引擎版本不兼容，请使用对应版本恢复" }
            val checksums = manifest.getJSONObject("sha256"); val keys = checksums.keys().asSequence().toSet()
            require(keys == seen - "manifest.json") { "存档文件与清单不一致" }
            for (name in keys) require(hash(File(stage, name)) == checksums.getString(name)) { "存档校验失败：$name" }
            require(File(stage, "profile/hds.sqlite").isFile && File(stage, "card.source").isFile && File(stage, "card.json").length() <= 6 * 1024 * 1024) { "存档缺少数据库或角色卡" }
            val saved = JSONObject(File(stage, "card.json").readText()); require(saved.getString("id") == id && saved.getJSONObject("card").getString("name").isNotBlank()) { "存档角色无效" }
            val sqlite = ByteArray(16); java.io.DataInputStream(File(stage, "profile/hds.sqlite").inputStream()).use { it.readFully(sqlite) }
            require(String(sqlite, Charsets.US_ASCII) == "SQLite format 3\u0000") { "存档数据库无效" }
            return stage
        } catch (error: Throwable) { stage.deleteRecursively(); throw error }
    }
    private fun writeJournal(value: JSONObject) {
        val temp = File(base, "story-operation.tmp")
        temp.outputStream().use { stream -> stream.write(value.toString().toByteArray()); stream.fd.sync() }
        Files.move(temp.toPath(), journal.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
    }
    fun stagePrevious(id: String): File {
        current(id)
        val previous = File(base, "story-backups/$id").listFiles()?.filter { it.isDirectory && it.name.matches(Regex("[a-f0-9-]{36}")) && File(it, "profile/hds.sqlite").isFile && File(it, "card.json").isFile }?.maxByOrNull { it.lastModified() }
            ?: throw IllegalArgumentException("当前角色没有可恢复的本机备份")
        val stage = File(base, "story-staging/${UUID.randomUUID()}").apply { mkdirs() }
        try {
            File(previous, "profile").walkTopDown().forEach { require(!Files.isSymbolicLink(it.toPath())) { "备份包含无效链接" } }
            require(File(previous, "profile").copyRecursively(File(stage, "profile"))) { "复制备份失败" }
            File(previous, "card.json").copyTo(File(stage, "card.json"))
            // Legacy local backups did not contain the immutable original card.
            val original = File(previous, "card.source")
            if (original.exists()) {
                require(original.isFile && !Files.isSymbolicLink(original.toPath())) { "备份角色卡原件无效" }
                original.copyTo(File(stage, "card.source"))
            }
            return stage
        } catch (error: Throwable) { stage.deleteRecursively(); throw error }
    }
    fun replace(id: String, stage: File? = null): String {
        require(!journal.exists()) { "上一次存档操作尚未恢复" }
        val profile = current(id).apply { mkdirs() }
        val operation = UUID.randomUUID().toString(); val backup = File(base, "story-backups/$id/$operation").apply { mkdirs() }
        val savedCard = card(id).readText(); File(backup, "card.json").writeText(savedCard)
        val original = source(id)
        require(!Files.isSymbolicLink(original.toPath()) && (!original.exists() || original.isFile)) { "角色卡原件无效" }
        if (original.isFile) File(backup, "card.source").outputStream().use { out -> original.inputStream().use { it.copyTo(out) }; out.fd.sync() }
        val record = JSONObject().put("cardId", id).put("operation", operation).put("phase", "prepared").put("oldCard", savedCard).put("sourcePresent", original.isFile)
        writeJournal(record)
        try {
            require(profile.renameTo(File(backup, "profile"))) { "无法备份原故事" }
            if (stage != null) {
                require(File(stage, "profile").renameTo(profile)) { "无法安装恢复的故事" }
                writeCard(id, File(stage, "card.json").readBytes())
                File(stage, "card.source").takeIf { it.exists() }?.let { writeSource(id, it) }
            } else {
                profile.mkdirs(); File(backup, "profile/qq-policy.json").takeIf { it.isFile }?.copyTo(File(profile, "qq-policy.json"))
            }
            writeJournal(record.put("phase", "installed"))
            return operation
        } catch (error: Throwable) { recover(); throw error }
    }
    fun commit() { require(journal.delete()) { "无法完成存档操作" } }
    fun recover() {
        if (!journal.exists()) return
        val record = JSONObject(journal.readText()); val id = record.getString("cardId"); val operation = record.getString("operation")
        require(operation.matches(Regex("[a-f0-9-]{36}"))) { "恢复清单无效" }
        val profile = current(id); val backup = File(base, "story-backups/$id/$operation/profile")
        if (backup.isDirectory) {
            if (profile.exists()) { val rejected = File(base, "story-staging/rejected-${UUID.randomUUID()}"); rejected.parentFile.mkdirs(); require(profile.renameTo(rejected)) { "无法隔离未完成故事" } }
            require(backup.renameTo(profile)) { "无法恢复旧故事，请保留应用数据并重试" }
        }
        // Repeating recovery after the profile was already moved back still restores
        // the card atomically; a process kill cannot leave half-written card JSON.
        writeCard(id, record.getString("oldCard").toByteArray())
        // Old journals predate source replacement; leave their original untouched.
        if (record.has("sourcePresent")) {
            if (record.getBoolean("sourcePresent")) writeSource(id, File(base, "story-backups/$id/$operation/card.source"))
            else require(!source(id).exists() || source(id).delete()) { "无法恢复角色卡原件状态" }
        }
        require(journal.delete()) { "无法清理恢复清单" }
    }
}
