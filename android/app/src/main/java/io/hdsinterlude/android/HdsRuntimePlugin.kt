package io.hdsinterlude.android

import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

/** Only URI identities cross this boundary; decoding stays sequential on the plugin IO executor. */
internal fun pickedImageUris(result: ActivityResult): List<android.net.Uri> {
    if (result.resultCode != Activity.RESULT_OK) return emptyList()
    val uris = linkedSetOf<android.net.Uri>()
    result.data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) } }
    result.data?.data?.let { uris.add(it) }
    return uris.toList()
}

@CapacitorPlugin(name = "HdsRuntime", permissions = [Permission(alias = "microphone", strings = [android.Manifest.permission.RECORD_AUDIO]), Permission(alias = "notifications", strings = [android.Manifest.permission.POST_NOTIFICATIONS])])
class HdsRuntimePlugin : Plugin() {
    private val io = Executors.newSingleThreadExecutor()
    private val retrievalIo = Executors.newSingleThreadExecutor()
    private fun runtime() = HdsRuntime.get(context)
    private val streamListener: (JSONObject) -> Unit = { notifyListeners("replyStream", JSObject.fromJSONObject(it)) }
    private val historyListener: (String) -> Unit = { notifyListeners("messageReceived", JSObject().put("cardId", it)) }
    override fun load() { super.load(); runtime().replyStream = streamListener; runtime().historyChanged = historyListener }
    private fun resolve(call: PluginCall, result: JSONObject = JSONObject()) { call.resolve(JSObject.fromJSONObject(result)) }
    private fun run(call: PluginCall, operation: () -> JSONObject) { io.execute { try { resolve(call, operation()) } catch (failure: Throwable) { call.reject(failure.message ?: "原生操作失败", failure.javaClass.simpleName) } } }
    @PluginMethod fun notificationSettings(call: PluginCall) { resolve(call, CharacterNotifications(context).status()) }
    @PluginMethod fun setMessageNotifications(call: PluginCall) {
        val notifications = CharacterNotifications(context)
        val enabled = call.getBoolean("enabled", false) == true
        try { notifications.configure(call.data) } catch (failure: Exception) { call.reject(failure.message ?: "通知设置无效"); return }
        notifications.setEnabled(enabled)
        if (enabled && android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            notifications.markRequested()
            requestPermissionForAlias("notifications", call, "notificationPermissionResult")
        } else resolve(call, notifications.status())
    }
    @PermissionCallback private fun notificationPermissionResult(call: PluginCall) { resolve(call, CharacterNotifications(context).status()) }
    @PluginMethod fun openNotificationSettings(call: PluginCall) {
        try { activity.startActivity(CharacterNotifications(context).settingsIntent()); resolve(call) }
        catch (failure: Exception) { call.reject("无法打开系统通知设置", failure) }
    }
    @PluginMethod fun notificationLaunch(call: PluginCall) {
        activity.runOnUiThread {
            val intent = activity.intent
            val cardId = intent?.getStringExtra(CharacterNotifications.CARD_EXTRA)
            intent?.removeExtra(CharacterNotifications.CARD_EXTRA)
            resolve(call, JSONObject().apply { if (cardId != null) put("cardId", cardId) })
        }
    }
    private val voiceRecorder by lazy { VoiceRecorder(context) }
    @PluginMethod fun voiceState(call: PluginCall) { run(call) { VoiceStore(context).state() } }
    @PluginMethod fun saveVoiceSettings(call: PluginCall) { run(call) { VoiceStore(context).saveSettings(call.data) } }
    @PluginMethod fun saveVoice(call: PluginCall) { run(call) { VoiceStore(context).saveVoice(call.data) } }
    @PluginMethod fun deleteVoice(call: PluginCall) { run(call) { VoiceStore(context).deleteVoice(call.getString("id") ?: "") } }
    @PluginMethod fun voiceAudio(call: PluginCall) { run(call) { VoiceStore(context).audio(call.getString("audioId") ?: "") } }
    @PluginMethod fun previewVoice(call: PluginCall) { run(call) {
        VoiceStore(context).synthesize(JSONObject(call.data.toString()).put("preview", true).put("text", "你好，今天也想和你一起，把日子慢慢过好。"))
    } }
    @PluginMethod fun pickVoiceAudio(call: PluginCall) {
        startActivityForResult(call, Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/wav", "audio/x-wav", "audio/mpeg")), "voicePicked")
    }
    @ActivityCallback private fun voicePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        run(call) { VoiceStore(context).import(result.data!!.data!!).put("cancelled", false) }
    }
    @PluginMethod fun startVoiceRecording(call: PluginCall) {
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissionForAlias("microphone", call, "voicePermissionResult")
        else run(call) { voiceRecorder.start(); JSONObject() }
    }
    @PermissionCallback private fun voicePermissionResult(call: PluginCall) {
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) { call.reject("请允许麦克风权限后录音"); return }
        run(call) { voiceRecorder.start(); JSONObject() }
    }
    @PluginMethod fun stopVoiceRecording(call: PluginCall) { run(call) { voiceRecorder.stop() } }
    @PluginMethod fun cancelVoiceRecording(call: PluginCall) { run(call) { voiceRecorder.cancel(); JSONObject() } }
    override fun handleOnDestroy() { if (runtime().replyStream === streamListener) runtime().replyStream = null; if (runtime().historyChanged === historyListener) runtime().historyChanged = null; runtime().cancelModelProbe(); voiceRecorder.cancel(); super.handleOnDestroy() }
    @PluginMethod fun status(call: PluginCall) { resolve(call, runtime().status()) }
    @PluginMethod fun powerSettings(call: PluginCall) { run(call) { RuntimePower(context).read() } }
    @PluginMethod fun savePowerSettings(call: PluginCall) { run(call) { RuntimePower(context).save(call.getString("mode") ?: "") } }
    @PluginMethod fun settings(call: PluginCall) { run(call) { runtime().store.publicSettings() } }
    @PluginMethod fun experienceSettings(call: PluginCall) { run(call) { runtime().store.experienceSettings() } }
    @PluginMethod fun saveExperience(call: PluginCall) { run(call) {
        runtime().store.saveExperience(call.data)
        if (runtime().status().optString("state") == "healthy") runtime().rpc("experience.configure", runtime().store.experienceSettings(true))
        runtime().store.experienceSettings()
    } }
    @PluginMethod fun characterAvatar(call: PluginCall) { run(call) { CharacterAvatarStore(context, runtime().store).read(call.getString("cardId") ?: "") } }
    @PluginMethod fun saveCharacterAvatar(call: PluginCall) { run(call) { CharacterAvatarStore(context, runtime().store).save(call.data) } }
    @PluginMethod fun appearance(call: PluginCall) { run(call) { AppearanceStore(context).read() } }
    @PluginMethod fun saveAppearance(call: PluginCall) { run(call) { AppearanceStore(context).save(call.data); JSONObject() } }
    @PluginMethod fun pickAppearanceAsset(call: PluginCall) {
        val kind = call.getString("kind")
        if (kind !in listOf("background", "font")) { call.reject("无效界面资源"); return }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).setType(if (kind == "font") "*/*" else "image/*").addCategory(Intent.CATEGORY_OPENABLE)
        startActivityForResult(call, intent, "appearancePicked")
    }
    @ActivityCallback private fun appearancePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        run(call) { AppearanceStore(context).import(call.getString("kind")!!, result.data!!.data!!) }
    }
    @PluginMethod fun pickImage(call: PluginCall) {
        if (call.getString("source") == "camera") {
            try {
                val file = java.io.File.createTempFile("hds-camera-", ".jpg", context.cacheDir)
                call.data.put("captureName", file.name)
                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val intent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                startActivityForResult(call, intent, "cameraPicked")
            } catch (failure: Exception) { call.reject("无法打开系统相机", failure) }
            return
        }
        startActivityForResult(call, Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true), "imagePicked")
    }
    @ActivityCallback private fun cameraPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val name = call.getString("captureName") ?: ""
        if (!name.matches(Regex("hds-camera-[a-zA-Z0-9-]+\\.jpg"))) { call.reject("拍摄文件已丢失，请重拍"); return }
        val file = java.io.File(context.cacheDir, name)
        if (result.resultCode != Activity.RESULT_OK) { file.delete(); resolve(call, JSONObject().put("cancelled", true)); return }
        run(call) {
            try { JSONObject().put("cancelled", false).put("images", JSONArray().put(JSONObject().put("dataUri", AppearanceStore(context).image(android.net.Uri.fromFile(file))))) }
            finally { file.delete() }
        }
    }
    @ActivityCallback private fun imagePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) { resolve(call, JSONObject().put("cancelled", true)); return }
        val uris = pickedImageUris(result)
        if (uris.isEmpty()) { call.reject("图库未返回可读取的图片"); return }
        val limit = (call.getInt("limit", 3) ?: 3).coerceIn(1, 3)
        run(call) {
            val images = JSONArray(); val errors = JSONArray()
            uris.take(limit).forEachIndexed { index, uri ->
                try { images.put(JSONObject().put("dataUri", AppearanceStore(context).image(uri))) }
                catch (failure: Exception) {
                    val message = failure.message?.takeIf { value -> listOf("文件过大", "图片尺寸", "无法读取所选文件", "无法解码图片", "图片解码失败", "图片压缩后仍过大").any { prefix -> value.startsWith(prefix) } } ?: "图片读取失败，请重新选择"
                    errors.put(JSONObject().put("index", index).put("message", message.take(160)))
                }
            }
            JSONObject().put("cancelled", false).put("images", images).put("errors", errors).put("truncated", uris.size > limit)
        }
    }
    @PluginMethod fun pickStickers(call: PluginCall) {
        try { requireStickerVision(runtime().store.publicSettings()) }
        catch (failure: Exception) { call.reject(failure.message ?: "请先配置识图模型", failure); return }
        val directory = call.getBoolean("directory", false) == true
        val intent = if (directory) Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            else Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        startActivityForResult(call, intent, "stickersPicked")
    }
    @ActivityCallback private fun stickersPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) { resolve(call, JSONObject().put("cancelled", true)); return }
        val tree = if (call.getBoolean("directory", false) == true) result.data?.data else null
        val uris = pickedImageUris(result)
        if (uris.isEmpty()) { call.reject("未返回可读取的文件"); return }
        run(call) { requireStickerVision(runtime().store.publicSettings()); StickerStore(context).import(uris, tree) }
    }
    @PluginMethod fun syncStickerLibrary(call: PluginCall) { run(call) {
        StickerStore(context).saveLibrary(call.getArray("packs") ?: throw IllegalArgumentException("缺少表情包清单")); JSONObject()
    } }
    @PluginMethod fun stickerImage(call: PluginCall) { run(call) { StickerStore(context).image(call.getString("id") ?: "") } }
    @PluginMethod fun pruneStickers(call: PluginCall) { run(call) {
        val values = call.getArray("keep") ?: throw IllegalArgumentException("缺少保留文件清单")
        StickerStore(context).prune((0 until values.length()).map { values.getString(it) }.toSet()); JSONObject()
    } }
    @PluginMethod fun exportStory(call: PluginCall) {
        startActivityForResult(call, Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, "HDS-story-${java.time.LocalDate.now()}.zip"), "storyDestination")
    }
    @ActivityCallback private fun storyDestination(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        run(call) {
            val id = call.getString("cardId") ?: throw IllegalArgumentException("缺少角色编号")
            runtime().maintainStory(id) {
                StoryArchive(runtime().store.base).exportTo(id) { context.contentResolver.openOutputStream(result.data!!.data!!, "wt") ?: throw IllegalArgumentException("无法写入存档") }
            }
            JSONObject().put("cancelled", false)
        }
    }
    @PluginMethod fun restoreStory(call: PluginCall) {
        startActivityForResult(call, Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE), "storySource")
    }
    @ActivityCallback private fun storySource(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        run(call) {
            val id = call.getString("cardId") ?: throw IllegalArgumentException("缺少角色编号")
            val archive = StoryArchive(runtime().store.base)
            val stage = context.contentResolver.openInputStream(result.data!!.data!!)?.use { archive.stage(id, it) } ?: throw IllegalArgumentException("无法读取存档")
            try { runtime().maintainStory(id) {
                try {
                    archive.replace(id, stage)
                    java.io.File(runtime().store.profile(), "restore-held.json").writeText("{}")
                    archive.commit()
                } catch (error: Throwable) { archive.recover(); throw error }
            } } finally { stage.deleteRecursively() }
            JSONObject().put("cancelled", false)
        }
    }
    @PluginMethod fun resetStory(call: PluginCall) { run(call) {
        val id = call.getString("cardId") ?: throw IllegalArgumentException("缺少角色编号")
        val archive = StoryArchive(runtime().store.base)
        val backup = runtime().maintainStory(id) { try { val backup = archive.replace(id); archive.commit(); backup } catch (error: Throwable) { archive.recover(); throw error } }
        JSONObject().put("backup", backup)
    } }
    @PluginMethod fun restorePreviousStory(call: PluginCall) { run(call) {
        val id = call.getString("cardId") ?: throw IllegalArgumentException("缺少角色编号")
        val archive = StoryArchive(runtime().store.base)
        runtime().maintainStory(id) {
            val stage = archive.stagePrevious(id)
            try { archive.replace(id, stage); java.io.File(runtime().store.profile(), "restore-held.json").writeText("{}"); archive.commit() }
            catch (error: Throwable) { archive.recover(); throw error }
            finally { stage.deleteRecursively() }
        }
        JSONObject()
    } }
    @PluginMethod fun saveSettings(call: PluginCall) { run(call) { runtime().store.saveSettings(call.data); JSONObject() } }
    @PluginMethod fun install(call: PluginCall) { run(call) { runtime().installAsync(); JSONObject() } }
    @PluginMethod fun cancelInstall(call: PluginCall) { run(call) { runtime().cancelInstall(); JSONObject() } }
    @PluginMethod fun diagnostics(call: PluginCall) { run(call) { runtime().diagnosticReport(call.getBoolean("probe", false) == true) } }
    @PluginMethod fun copyDiagnostics(call: PluginCall) { run(call) {
        val text = runtime().diagnosticReport(true).toString(2)
        val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("HDS 安装诊断", text))
        JSONObject()
    } }
    @PluginMethod fun saveDiagnostics(call: PluginCall) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE)
        intent.putExtra(Intent.EXTRA_TITLE, "HDS-install-diagnostic.json")
        startActivityForResult(call, intent, "diagnosticDestination")
    }
    @PluginMethod fun saveMessageDiagnostics(call: PluginCall) {
        // Capture before opening the picker, so switching roles cannot export a different story.
        io.execute {
            var snapshot: java.io.File? = null
            try {
                val payload = JSONObject()
                call.getString("messageId")?.let { payload.put("messageId", it) }
                val report = runtime().rpc("diagnostics.messages", payload)
                // Keep large reports out of the Activity state/IPC bundle.
                context.cacheDir.listFiles()?.filter { it.name.startsWith("message-diagnostic-") && it.name.endsWith(".json") && System.currentTimeMillis() - it.lastModified() > 86400000 }?.forEach { it.delete() }
                val file = java.io.File.createTempFile("message-diagnostic-", ".json", context.cacheDir)
                snapshot = file
                file.writeText(report.toString(2), Charsets.UTF_8)
                call.data.put("diagnosticSnapshotFile", file.name)
                activity.runOnUiThread {
                    try {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE)
                        intent.putExtra(Intent.EXTRA_TITLE, "HDS-message-diagnostic.json")
                        startActivityForResult(call, intent, "messageDiagnosticDestination")
                    } catch (_: Exception) { file.delete(); call.reject("无法打开系统文件保存窗口") }
                }
            } catch (_: Exception) { snapshot?.delete(); call.reject("无法读取当前故事的消息诊断") }
        }
    }
    @ActivityCallback private fun messageDiagnosticDestination(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        run(call) {
            val name = call.getString("diagnosticSnapshotFile").orEmpty()
            require(name.matches(Regex("message-diagnostic-[a-zA-Z0-9-]+\\.json"))) { "诊断快照已失效，请重新导出" }
            val file = java.io.File(context.cacheDir, name)
            require(file.canonicalFile.parentFile == context.cacheDir.canonicalFile) { "诊断快照路径无效" }
            try {
                val uri = result.data?.data
                if (result.resultCode != Activity.RESULT_OK || uri == null) JSONObject().put("cancelled", true)
                else {
                    context.contentResolver.openOutputStream(uri, "wt")?.use { out -> file.inputStream().use { it.copyTo(out) }; out.flush() }
                        ?: throw IllegalArgumentException("无法写入所选文档")
                    JSONObject().put("cancelled", false)
                }
            } finally { file.delete() }
        }
    }
    @ActivityCallback private fun diagnosticDestination(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        val uri = result.data!!.data!!
        run(call) {
            val bytes = runtime().diagnosticReport(true).toString(2).toByteArray(Charsets.UTF_8)
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes); it.flush() }
                ?: throw IllegalArgumentException("无法写入所选文档")
            JSONObject().put("cancelled", false)
        }
    }
    @PluginMethod fun start(call: PluginCall) { run(call) {
        // Validate configuration before creating a foreground notification.
        runtime().store.selectedCard()
        val settings = runtime().store.publicSettings()
        require(settings.optString("endpoint").isNotEmpty() && settings.optString("model").isNotEmpty()) { "请先保存模型配置" }
        ContextCompat.startForegroundService(context, Intent(context, HdsService::class.java))
        try { runtime().startAsync() } catch (failure: Throwable) { HdsService.stop(context); throw failure }
        JSONObject()
    } }
    @PluginMethod fun saveQQQr(call: PluginCall) {
        val data = call.getString("base64")
        if (data == null || data.length > 256 * 1024 || !data.startsWith("iVBORw0KGgo")) { call.reject("无效二维码 PNG"); return }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).setType("image/png").addCategory(Intent.CATEGORY_OPENABLE)
        intent.putExtra(Intent.EXTRA_TITLE, "HDS-QQ-login.png")
        startActivityForResult(call, intent, "qqQrDestination")
    }
    @ActivityCallback private fun qqQrDestination(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        val uri = result.data!!.data!!
        run(call) {
            val bytes = Base64.decode(call.getString("base64"), Base64.NO_WRAP)
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: throw IllegalArgumentException("无法保存二维码")
            JSONObject().put("cancelled", false)
        }
    }
    @PluginMethod fun stop(call: PluginCall) { run(call) { runtime().stopBlocking(); HdsService.stop(context); JSONObject() } }
    @PluginMethod fun cards(call: PluginCall) { run(call) { JSONObject().put("cards", runtime().store.listCards()) } }
    @PluginMethod fun saveCard(call: PluginCall) { run(call) {
        val text = call.getString("base64") ?: throw IllegalArgumentException("缺少原始卡文件")
        require(text.length <= 45 * 1024 * 1024) { "文件超过大小限制" }
        val card = call.getObject("card") ?: throw IllegalArgumentException("缺少角色卡预览")
        runtime().store.saveCard(card, Base64.decode(text, Base64.NO_WRAP))
    } }
    @PluginMethod fun selectCard(call: PluginCall) { run(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("缺少角色 ID")
        runtime().stopBlocking(); HdsService.stop(context); runtime().store.select(id); JSONObject()
    } }
    @PluginMethod fun updateCard(call: PluginCall) { run(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("缺少角色 ID")
        val card = call.getObject("card") ?: throw IllegalArgumentException("缺少人设内容")
        if (runtime().store.publicSettings().optString("activeCard") == id) {
            runtime().stopBlocking(); HdsService.stop(context)
        }
        runtime().store.updateCard(id, card)
    } }
    @PluginMethod fun deleteCard(call: PluginCall) { run(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("缺少角色 ID")
        if (runtime().store.publicSettings().optString("activeCard") == id) {
            runtime().stopBlocking(); HdsService.stop(context)
        }
        runtime().store.deleteCard(id); JSONObject()
    } }
    @PluginMethod fun rpc(call: PluginCall) {
        if (call.getString("method") == "models.cancelRetrieval") { runtime().cancelModelProbe(); resolve(call, JSONObject().put("data", JSONObject())); return }
        if (call.getString("method") == "models.testRetrieval") {
            val payload = JSONObject((call.getObject("payload") ?: JSONObject()).toString())
            retrievalIo.execute { try { resolve(call, runtime().testRetrieval(payload)) } catch (failure: Throwable) {
                val safe = failure.message?.takeIf { it in setOf("请先安装包含模型测试的运行环境", "已有模型测试正在运行", "运行环境正在维护", "模型测试进程清理失败，请重启应用") }
                call.reject(safe ?: "模型测试未完成；请检查运行环境、配置或清理状态")
            } }
            return
        }
        run(call) {
        val method = call.getString("method") ?: throw IllegalArgumentException("缺少方法")
        val payload = call.getObject("payload") ?: JSONObject()
        when (method) {
            "models.test" -> runtime().testModel(payload)
            "models.list" -> runtime().listModels(payload)
            else -> runtime().rpc(method, payload)
        }
    } }
    @PluginMethod fun exportCharacter(call: PluginCall) {
        try {
            val document = CharacterDocument.from(call.data)
            startActivityForResult(call, Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(document.mime).putExtra(Intent.EXTRA_TITLE, document.name), "characterDestination")
        } catch (failure: Exception) { call.reject(failure.message ?: "无法打开保存位置", failure) }
    }
    @ActivityCallback private fun characterDestination(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { resolve(call, JSONObject().put("cancelled", true)); return }
        val uri = result.data!!.data!!
        run(call) {
            val document = CharacterDocument.from(call.data)
            val output = context.contentResolver.openOutputStream(uri, "wt") ?: throw IllegalArgumentException("无法写入所选位置")
            document.writeTo(output)
            JSONObject().put("cancelled", false).put("name", document.name)
        }
    }
    @PluginMethod fun pickCard(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE)
        intent.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "application/x-json", "text/json", "image/png", "application/octet-stream", "text/plain", "text/yaml", "application/yaml", "application/x-yaml", "application/zip", "application/x-zip-compressed"))
        startActivityForResult(call, intent, "cardPicked")
    }
    @ActivityCallback private fun cardPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { call.reject("已取消文件选择"); return }
        val uri = result.data!!.data!!
        run(call) {
            val buffer = ByteArrayOutputStream()
            context.contentResolver.openInputStream(uri)?.use { input ->
                val block = ByteArray(65536)
                while (true) { val count = input.read(block); if (count < 0) break; require(buffer.size() + count <= 32 * 1024 * 1024) { "角色卡超过 32 MiB" }; buffer.write(block, 0, count) }
            } ?: throw IllegalArgumentException("无法读取所选文档")
            JSONObject().put("base64", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP)).put("name", "所选文档")
        }
    }
}
