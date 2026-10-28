package com.zshell

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.WebStorage
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

private const val APK_MIME = "application/vnd.android.package-archive"

/**
 * In-app download manager backed by the system DownloadManager (no extra
 * third-party dependency). Own update downloads land in the app's private
 * external files dir and auto-launch the installer when complete. Downloads
 * enqueued by the embedded WebView (console pages) go to the public Downloads
 * dir; both are visible to [queryDownloads] because DownloadProvider filters
 * by caller uid.
 */
class ApkInstallerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ApkInstaller"

  /** Metadata for downloads WE enqueued; survives app restarts in prefs. */
  private data class DownloadMeta(
      val id: Long,
      val fileName: String,
      val url: String,
      val kind: String,
      /** Stall watchdog: bytes seen at the last poll where progress happened. */
      val lastBytes: Long = 0L,
      /** Wall-clock ms of the last observed progress (0 = unknown). */
      val lastMoveAt: Long = 0L,
      /** Set when WE cancelled the download (stall watchdog); shown as failed. */
      val deadReason: String? = null,
  )

  private val dm: DownloadManager
    get() = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  private val prefs by lazy {
    reactContext.getSharedPreferences("zshell_downloads", Context.MODE_PRIVATE)
  }

  private var receiverReady = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
      val meta = loadMeta().firstOrNull { it.id == id } ?: return
      if (meta.kind == KIND_UPDATE && dm.getUriForDownloadedFile(id) != null) {
        installApk(File(downloadDir(), meta.fileName))
      }
    }
  }

  /**
   * Android 13+ requires an explicit export flag and some containers do not
   * treat DownloadManager broadcasts as protected system broadcasts. The
   * receiver only acts on ids it can verify against DownloadManager state,
   * so RECEIVER_EXPORTED is safe here.
   */
  private fun ensureReceiver() {
    if (receiverReady) {
      return
    }
    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        reactContext.registerReceiver(receiver, filter)
      }
      receiverReady = true
    } catch (e: Exception) {
      // Registration failure surfaces on the next download attempt instead.
    }
  }

  private fun downloadDir(): File? =
      reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)

  // ---------- metadata persistence ----------

  private fun loadMeta(): List<DownloadMeta> {
    try {
      val raw = prefs.getString(KEY_ITEMS, null) ?: return emptyList()
      val arr = JSONArray(raw)
      return (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        DownloadMeta(
            id = o.optLong("id"),
            fileName = o.optString("name"),
            url = o.optString("url"),
            kind = o.optString("kind", KIND_FILE),
            lastBytes = o.optLong("lastBytes"),
            lastMoveAt = o.optLong("lastMoveAt"),
            deadReason = o.optString("deadReason").ifEmpty { null },
        )
      }
    } catch (e: Exception) {
      return emptyList()
    }
  }

  private fun saveMeta(list: List<DownloadMeta>) {
    val arr = JSONArray()
    list.forEach { m ->
      val o = JSONObject()
          .put("id", m.id)
          .put("name", m.fileName)
          .put("url", m.url)
          .put("kind", m.kind)
          .put("lastBytes", m.lastBytes)
          .put("lastMoveAt", m.lastMoveAt)
      if (m.deadReason != null) {
        o.put("deadReason", m.deadReason)
      }
      arr.put(o)
    }
    prefs.edit().putString(KEY_ITEMS, arr.toString()).apply()
  }

  // ---------- public bridge methods ----------

  /**
   * Enqueue one of OUR downloads (currently: update APKs) and resolve the
   * download id immediately. Completion is observed via [queryDownloads]
   * polling; update downloads auto-launch the installer natively.
   */
  @ReactMethod
  fun download(url: String, fileName: String, kind: String, promise: Promise) {
    val dir = downloadDir()
    if (dir == null) {
      promise.reject("STORAGE", "外部存储不可用")
      return
    }
    ensureReceiver()
    val safeName = sanitizeFileName(fileName)
    val parsedUrl = Uri.parse(url)
    val scheme = parsedUrl.scheme?.lowercase()
    if (scheme != "https" && scheme != "http") {
      promise.reject("SCHEME", "仅支持 http/https 下载地址")
      return
    }
    val metas = loadMeta().toMutableList()
    if (kind == KIND_UPDATE) {
      // Replace any previous update download/file first.
      metas.filter { it.kind == KIND_UPDATE }.forEach { dm.remove(it.id) }
      metas.removeAll { it.kind == KIND_UPDATE }
      dir.listFiles()?.forEach { if (it.name.endsWith(".apk")) it.delete() }
    }
    // Stale watchdog-cancelled rows served their purpose once a new download
    // starts; drop them so retrying doesn't leave duplicate failed entries.
    metas.removeAll { it.deadReason != null }
    val request = try {
      buildRequest(parsedUrl, safeName, kind)
    } catch (e: Exception) {
      promise.reject("REQUEST", e.message ?: "下载请求无效", e)
      return
    }
    val id = try {
      dm.enqueue(request)
    } catch (e: Exception) {
      promise.reject("ENQUEUE", e.message ?: "无法开始下载", e)
      return
    }
    metas.add(
        DownloadMeta(
            id = id,
            fileName = safeName,
            url = url,
            kind = kind,
            lastMoveAt = System.currentTimeMillis()))
    saveMeta(metas)
    promise.resolve(id.toDouble())
  }

  /** Common DownloadManager request for our own downloads. */
  private fun buildRequest(
      parsedUrl: Uri,
      safeName: String,
      kind: String
  ): DownloadManager.Request =
      DownloadManager.Request(parsedUrl)
          .setTitle(if (kind == KIND_UPDATE) "ZShell 更新" else safeName)
          .setDescription("下载完成后可在应用内打开")
          .setNotificationVisibility(
              DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalFilesDir(
              reactContext, Environment.DIRECTORY_DOWNLOADS, safeName)
          .setAllowedOverMetered(true)
          .setAllowedOverRoaming(true)

  /**
   * Continue a paused download. DownloadManager has no public resume API,
   * so the entry is re-enqueued from the original URL (our metadata first,
   * the download's own COLUMN_URI otherwise), yielding a new id.
   */
  @ReactMethod
  fun resumeDownload(id: Double, promise: Promise) {
    val lid = id.toLong()
    var cursorUri: String? = null
    var paused = false
    try {
      val cursor = dm.query(DownloadManager.Query().setFilterById(lid))
      if (cursor.moveToFirst()) {
        val uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_URI)
        if (uriIdx >= 0) {
          cursorUri = cursor.getString(uriIdx)
        }
        val stIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        paused = stIdx >= 0 && cursor.getInt(stIdx) == DownloadManager.STATUS_PAUSED
      }
      cursor.close()
    } catch (e: Exception) {
      promise.reject("RESUME", "无法读取该下载", e)
      return
    }
    val meta = loadMeta().firstOrNull { it.id == lid }
    val url = meta?.url?.takeIf { it.isNotEmpty() } ?: cursorUri
    if (!paused) {
      promise.reject("RESUME", "仅暂停中的下载可以继续")
      return
    }
    if (url.isNullOrEmpty()) {
      promise.reject("RESUME", "该下载无法继续，请删除后重试")
      return
    }
    val safeName =
        meta?.fileName?.takeIf { it.isNotEmpty() }
            ?: sanitizeFileName(url.substringAfterLast('/').ifEmpty { "download" })
    val kind = meta?.kind ?: KIND_FILE
    try {
      dm.remove(lid)
      val newId = dm.enqueue(buildRequest(Uri.parse(url), safeName, kind))
      saveMeta(
          loadMeta().filterNot { it.id == lid } +
              DownloadMeta(
                  id = newId,
                  fileName = safeName,
                  url = url,
                  kind = kind,
                  lastMoveAt = System.currentTimeMillis()))
      promise.resolve(newId.toDouble())
    } catch (e: Exception) {
      promise.reject("RESUME", e.message ?: "无法继续该下载", e)
    }
  }

  /**
   * All downloads owned by this app uid — ours plus anything the console
   * WebView enqueued — with live status from DownloadManager.
   */
  @ReactMethod
  fun queryDownloads(promise: Promise) {
    try {
      ensureReceiver()
      val now = System.currentTimeMillis()
      val metas = loadMeta().toMutableList()
      val byId: MutableMap<Long, DownloadMeta> = metas.associateBy { it.id }.toMutableMap()
      val cursor = dm.query(DownloadManager.Query())
      val out: WritableArray = Arguments.createArray()
      val liveIds = mutableSetOf<Long>()
      val stalled = mutableListOf<DownloadMeta>()
      val stalledNames = mutableListOf<String>()
      while (cursor.moveToNext()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID))
        liveIds.add(id)
        val titleIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE)
        val cursorTitle = if (titleIdx >= 0) cursor.getString(titleIdx) else "下载"
        var meta = byId[id]
        if (meta == null) {
          // First time we see a uid download we didn't enqueue ourselves
          // (console WebView): start tracking it for the stall watchdog.
          meta = DownloadMeta(
              id = id, fileName = cursorTitle, url = "", kind = KIND_FILE,
              lastBytes = 0L, lastMoveAt = now)
          byId[id] = meta
          metas.add(meta)
        }

        val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val status = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
        val reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val reason = if (reasonIdx >= 0) cursor.getInt(reasonIdx) else -1
        val bytesIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
        val totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        val bytes = if (bytesIdx >= 0) cursor.getLong(bytesIdx) else 0L

        if (status == DownloadManager.STATUS_PENDING ||
            status == DownloadManager.STATUS_RUNNING) {
          if (bytes > meta.lastBytes) {
            byId[id] = meta.copy(lastBytes = bytes, lastMoveAt = now)
          } else if (meta.lastMoveAt == 0L) {
            // Legacy metadata from before the watchdog: start its clock now.
            byId[id] = meta.copy(lastMoveAt = now)
          } else if (meta.lastMoveAt in 1 until now - STALL_MS) {
            // No progress for a long time: cancel and surface it as failed
            // with a retry hint instead of leaving a zombie entry.
            stalled.add(meta.copy(deadReason = "长时间无响应，已自动取消"))
            stalledNames.add(meta.fileName.ifEmpty { cursorTitle })
            continue
          }
        } else if (status == DownloadManager.STATUS_PAUSED) {
          // User-paused: restart the stall grace for when it resumes.
          byId[id] = meta.copy(lastMoveAt = now)
        }

        meta = byId[id]!!
        val item: WritableMap = Arguments.createMap()
        item.putDouble("id", id.toDouble())
        item.putString(
            "name", meta.fileName.ifEmpty { cursorTitle })
        item.putString("kind", meta.kind)
        item.putString("url", meta.url)
        when (status) {
          DownloadManager.STATUS_PENDING -> item.putString("status", "pending")
          DownloadManager.STATUS_RUNNING -> item.putString("status", "running")
          DownloadManager.STATUS_PAUSED -> {
            item.putString("status", "paused")
            item.putString("reason", pauseReasonText(reason))
          }
          DownloadManager.STATUS_SUCCESSFUL -> item.putString("status", "successful")
          DownloadManager.STATUS_FAILED -> {
            item.putString("status", "failed")
            item.putString("reason", reasonText(reason))
          }
          else -> item.putString("status", "running")
        }
        item.putDouble("bytesSoFar", bytes.toDouble())
        item.putDouble(
            "totalBytes",
            (if (totalIdx >= 0) cursor.getLong(totalIdx) else 0L).toDouble())
        out.pushMap(item)
      }
      cursor.close()

      // Cancel the stalled ones only after the cursor is closed, and record
      // them as failed rows so the UI can offer retry/delete.
      for (dead in stalled) {
        try {
          dm.remove(dead.id)
        } catch (e: Exception) {
          // already gone
        }
        liveIds.remove(dead.id)
        byId[dead.id] = dead
        val item: WritableMap = Arguments.createMap()
        item.putDouble("id", dead.id.toDouble())
        item.putString("name", dead.fileName)
        item.putString("kind", dead.kind)
        item.putString("url", dead.url)
        item.putString("status", "failed")
        item.putString("reason", dead.deadReason)
        item.putDouble("bytesSoFar", 0.0)
        item.putDouble("totalBytes", 0.0)
        out.pushMap(item)
      }

      // Persist the (possibly updated) watchdog state; keep cancelled rows so
      // they stay visible until the user deletes/retries them.
      val keep = metas.map { byId[it.id] ?: it }.filter { it.id in liveIds || it.deadReason != null }
      saveMeta(keep)
      promise.resolve(out)

      if (stalledNames.isNotEmpty()) {
        val text = stalledNames.joinToString("、")
        try {
          reactContext.getNativeModule(NotificationsModule::class.java)
              ?.notify(6.0, "下载已自动取消", "「$text」长时间无响应，可重试或删除")
        } catch (e: Exception) {
          // notification is best-effort
        }
      }
    } catch (e: Exception) {
      promise.reject("QUERY", "无法读取下载列表", e)
    }
  }

  /** Cancel (running) or delete (finished) a download; also removes its file. */
  @ReactMethod
  fun removeDownload(id: Double, promise: Promise) {
    val lid = id.toLong()
    try {
      dm.remove(lid)
      saveMeta(loadMeta().filterNot { it.id == lid })
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("REMOVE", e.message ?: "无法移除该下载", e)
    }
  }

  /** Open a finished download: ours via FileProvider, console ones via the
   * downloads provider content uri. APKs go to the system installer. */
  @ReactMethod
  fun openDownloadedFile(id: Double, promise: Promise) {
    val lid = id.toLong()
    val meta = loadMeta().firstOrNull { it.id == lid }
    try {
      if (meta != null) {
        val file = File(downloadDir(), meta.fileName)
        if (!file.exists()) {
          promise.reject("OPEN", "文件不存在（可能已被清理）")
          return
        }
        val uri =
            FileProvider.getUriForFile(
                reactContext, "${reactContext.packageName}.fileprovider", file)
        viewFile(uri, mimeFor(meta.fileName), promise)
      } else {
        val uri = Uri.parse("content://downloads/my_downloads/$lid")
        viewFile(uri, downloadMime(lid), promise)
      }
    } catch (e: Exception) {
      promise.reject("OPEN", e.message ?: "无法打开文件", e)
    }
  }

  /** Write text to a cache file and offer it via the system share sheet
   * (used for encrypted backups). */
  @ReactMethod
  fun shareTextFile(fileName: String, text: String, promise: Promise) {
    try {
      val safeName = sanitizeFileName(fileName).ifEmpty { "zshell-backup.txt" }
      val shareDir = File(reactContext.cacheDir, "share")
      shareDir.mkdirs()
      val target = File(shareDir, safeName)
      target.writeText(text, Charsets.UTF_8)
      val uri =
          FileProvider.getUriForFile(
              reactContext, "${reactContext.packageName}.fileprovider", target)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(Intent.createChooser(send, null).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      })
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SHARE", e.message ?: "无法分享文件", e)
    }
  }

  /** Open the system Downloads screen (where console-file downloads live). */
  @ReactMethod
  fun openDownloadsUi(promise: Promise) {
    try {
      val intent = Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("DOWNLOADS_UI", e.message ?: "无法打开系统下载列表", e)
    }
  }

  /** Open a URL in a real browser (BROWSABLE category), not an app chooser. */
  @ReactMethod
  fun openUrlInBrowser(url: String, promise: Promise) {
    try {
      val uri = Uri.parse(url)
      val browser = Intent(Intent.ACTION_VIEW, uri).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val resolved = reactContext.packageManager.resolveActivity(
          browser, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
      val target = if (resolved != null) browser
          else Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactContext.startActivity(target)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("BROWSER", e.message ?: "无法打开浏览器", e)
    }
  }

  // ---------- update-apk housekeeping (kept for launch cleanup) ----------

  /** Names (zshell-update-<version>.apk) of update APKs still on disk. */
  @ReactMethod
  fun listUpdateApks(promise: Promise) {
    val dir = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
    val names = dir
        ?.listFiles()
        ?.filter { it.name.startsWith(UPDATE_PREFIX) && it.name.endsWith(".apk") }
        ?.map { it.name }
        ?: emptyList<String>()
    promise.resolve(names)
  }

  /** Delete one update APK by exact name (only in the update dir). */
  @ReactMethod
  fun deleteUpdateApk(name: String) {
    try {
      if (!name.startsWith(UPDATE_PREFIX) || !name.endsWith(".apk")) {
        return
      }
      // Removing the DownloadManager record also deletes its file — and the
      // record is what keeps a long-installed update visible in 下载管理.
      val metas = loadMeta().toMutableList()
      val doomed = metas.filter { it.kind == KIND_UPDATE && it.fileName == name }
      if (doomed.isNotEmpty()) {
        dm.remove(*doomed.map { it.id }.toLongArray())
        metas.removeAll { it.kind == KIND_UPDATE && it.fileName == name }
        saveMeta(metas)
      }
      // Fallback for files whose record is already gone.
      val dir = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
      val target = File(dir, name)
      if (target.exists()) {
        target.delete()
      }
    } catch (e: Exception) {
      // cleanup is best-effort
    }
  }

  // ---------- web login state ----------

  /**
   * Wipe all WebView cookies and web storage (localStorage etc.) held by this
   * app — i.e. log the console pages (Kimi Code account, any web session)
   * out. Pairing credentials in encrypted storage are NOT touched.
   */
  @ReactMethod
  fun clearWebSession(promise: Promise) {
    try {
      val cookies = CookieManager.getInstance()
      cookies.removeAllCookies(null)
      cookies.removeSessionCookies(null)
      cookies.flush()
      WebStorage.getInstance().deleteAllData()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CLEAR_WEB", e.message ?: "清除失败", e)
    }
  }

  // ---------- helpers ----------

  private fun installApk(apk: File): Boolean = try {
    val uri =
        FileProvider.getUriForFile(
            reactContext, "${reactContext.packageName}.fileprovider", apk)
    val install = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, APK_MIME)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(install)
    true
  } catch (e: Exception) {
    false
  }

  private fun viewFile(uri: Uri, mime: String, promise: Promise) {
    val view = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, mime)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (reactContext.packageManager.resolveActivity(view, 0) == null) {
      promise.reject("OPEN", "本机没有能打开该文件的应用")
      return
    }
    reactContext.startActivity(view)
    promise.resolve(null)
  }

  private fun mimeFor(fileName: String): String {
    if (fileName.endsWith(".apk", ignoreCase = true)) {
      return APK_MIME
    }
    val ext = MimeTypeMap.getFileExtensionFromUrl(fileName)
    return if (ext != null)
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.lowercase())
            ?: "application/octet-stream"
    else
        "application/octet-stream"
  }

  /** Media type recorded by DownloadManager for webview-initiated files. */
  private fun downloadMime(id: Long): String = try {
    val cursor = dm.query(DownloadManager.Query().setFilterById(id))
    var mime = "application/octet-stream"
    if (cursor.moveToFirst()) {
      val idx = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE)
      if (idx >= 0 && !cursor.isNull(idx) && cursor.getString(idx).isNotEmpty()) {
        mime = cursor.getString(idx)
      }
    }
    cursor.close()
    mime
  } catch (e: Exception) {
    "application/octet-stream"
  }

  companion object {
    private const val KEY_ITEMS = "items"
    private const val KIND_UPDATE = "update"
    private const val KIND_FILE = "file"
    private const val UPDATE_PREFIX = "zshell-update-"
    /** Stall watchdog: cancel a pending/running download with no byte
     * progress for this long (checked whenever any screen polls the list). */
    private const val STALL_MS = 2 * 60 * 1000L

    /** Strip path separators / reserved chars; keep it short but readable. */
    private fun sanitizeFileName(name: String): String {
      val cleaned = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").trim()
      val bounded = if (cleaned.length > 80) cleaned.substring(0, 80) else cleaned
      return bounded.ifEmpty { "download" }
    }

    /** Human-readable reason for a failed DownloadManager entry. */
    private fun reasonText(reason: Int): String = when {
      reason in 400..599 -> "HTTP $reason（国内网络访问 GitHub 可能需要代理）"
      reason == DownloadManager.ERROR_FILE_ERROR -> "文件写入错误"
      reason == DownloadManager.ERROR_DEVICE_NOT_FOUND -> "存储不可用"
      reason == DownloadManager.ERROR_INSUFFICIENT_SPACE -> "存储空间不足"
      reason == DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "服务器返回异常状态"
      reason == DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "重定向过多"
      reason == DownloadManager.ERROR_CANNOT_RESUME -> "无法续传"
      reason == DownloadManager.ERROR_HTTP_DATA_ERROR -> "数据传输错误"
      else -> "原因代码 $reason"
    }

    /** Why a download is sitting in the paused state. */
    private fun pauseReasonText(reason: Int): String = when (reason) {
      DownloadManager.PAUSED_WAITING_FOR_NETWORK -> "等待网络恢复"
      DownloadManager.PAUSED_WAITING_TO_RETRY -> "等待重试"
      DownloadManager.PAUSED_QUEUED_FOR_WIFI -> "等待 Wi-Fi"
      7 -> "等待设备空闲" // PAUSED_QUEUED_FOR_DEVICE is not in the public API
      else -> "已暂停"
    }
  }
}

class ApkInstallerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
      listOf(
          ApkInstallerModule(reactContext),
          CryptoModule(reactContext),
          NotificationsModule(reactContext),
          PrivacyWindowModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
