package io.hdsinterlude.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import android.os.Handler
import android.os.Looper

class HdsService : Service() {
    companion object {
        @Volatile private var active: HdsService? = null
        fun stop(context: android.content.Context) {
            active?.intentionalStop = true
            context.stopService(Intent(context, HdsService::class.java))
        }
        @JvmStatic fun refreshPowerPolicy() { active?.let { service -> service.handler.post { service.updateWakeLock() } } }
        @JvmStatic fun noteActivity() { active?.let { service -> service.handler.post {
            service.wakePolicy.activity(android.os.SystemClock.elapsedRealtime()); service.updateWakeLock()
        } } }
    }
    @Volatile private var intentionalStop = false
    private var wakeLock: PowerManager.WakeLock? = null
    private val wakePolicy = WakePolicy()
    private val messageIo = java.util.concurrent.Executors.newSingleThreadExecutor()
    private lateinit var messages: CharacterNotifications
    private val push: (String, String, CharacterMessage, Boolean) -> Unit = { id, name, message, foreground ->
        enqueueMessages { messages.receive(id, name, message, foreground, { messages.avatar(HdsRuntime.get(this).store, id) }) }
    }
    private fun enqueueMessages(work: () -> Unit) {
        try { messageIo.execute { try { work() } catch (failure: Exception) { android.util.Log.i("HDS", "角色消息补拉跳过：${failure.javaClass.simpleName}") } } }
        catch (_: java.util.concurrent.RejectedExecutionException) { /* Service already stopped. */ }
    }
    private fun catchUp() {
        val runtime = HdsRuntime.get(this)
        if (runtime.status().optString("state") != "healthy") return
        val cardId = runtime.runningCardId; val name = runtime.runningCardName
        if (cardId.isBlank()) return
        // Drain bounded pages in timestamp order. Stdout never advances this
        // reconciliation cursor, so missed older pushes remain recoverable.
        var since = messages.cursor(cardId)
        repeat(20) {
            if (active !== this || intentionalStop || runtime.runningCardId != cardId) return
            val rows = runtime.rpc("messages.since", org.json.JSONObject().put("since", since.toString()).put("limit", 200)).getJSONArray("data")
            if (active !== this || intentionalStop || runtime.runningCardId != cardId) return
            val foreground = AppVisibility.visible
            if (rows.length() == 0) return
            var through = since
            for (i in 0 until rows.length()) {
                val message = CharacterMessage.fromJson(rows.getJSONObject(i)) ?: throw IllegalArgumentException("无效消息")
                messages.receive(cardId, name, message, foreground, { messages.avatar(runtime.store, cardId) })
                through = maxOf(through, message.occurredAt)
            }
            if (through <= since) return
            messages.reconcile(cardId, through); since = through
            if (rows.length() < 200) return
        }
    }
    private val handler = Handler(Looper.getMainLooper())
    private val health = object : Runnable { override fun run() {
        HdsRuntime.get(this@HdsService).refreshServiceHealth {
            enqueueMessages { catchUp() }
            handler.post {
                if (active === this@HdsService && !intentionalStop) {
                    if (android.os.Build.VERSION.SDK_INT < 33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        getSystemService(NotificationManager::class.java).notify(42, notification())
                    }
                    handler.postDelayed(this, 60_000L)
                }
            }
        }
    } }
    private fun updateWakeLock() {
        if (active !== this || intentionalStop) return
        val timeout = wakePolicy.timeout(RuntimePower(this).mode(), AppVisibility.visible, android.os.SystemClock.elapsedRealtime())
        wakeLock?.let { lock -> if (timeout > 0) lock.acquire(timeout) else if (lock.isHeld) lock.release() }
    }
    private val renew = object : Runnable { override fun run() { updateWakeLock(); handler.postDelayed(this, 60_000L) } }
    override fun onCreate() {
        super.onCreate()
        active = this
        messages = CharacterNotifications(this)
        messages.createChannel()
        HdsRuntime.get(this).messagePush = push
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HDS:runtime").apply { setReferenceCounted(false) }
        wakePolicy.activity(android.os.SystemClock.elapsedRealtime())
        renew.run()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("hds-runtime", "HDS 本地运行", NotificationManager.IMPORTANCE_LOW))
        startForeground(42, notification())
        handler.postDelayed(health, 10_000L)
    }
    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getService(this, 1, Intent(this, HdsService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, "hds-runtime").setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("HDS 本机运行")
            .setContentText(HdsRuntime.get(this).notificationText()).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "停止全部", stop).build()).build()
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { intentionalStop = true; HdsRuntime.get(this).stopAsync(); stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() { if (HdsRuntime.get(this).messagePush === push) HdsRuntime.get(this).messagePush = null; messageIo.shutdownNow(); handler.removeCallbacksAndMessages(null); wakeLock?.let { if (it.isHeld) it.release() }; if (active === this) active = null; if (!intentionalStop) HdsRuntime.get(this).stopAsync(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
