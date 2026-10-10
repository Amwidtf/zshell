package com.zshell

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.webkit.MimeTypeMap
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
        )
      }
    } catch (e: Exception) {
      return emptyList()
    }
  }

  private fun saveMeta(list: List<DownloadMeta>) {
    val arr = JSONArray()
    list.forEach { m ->
      arr.put(
          JSONObject()
              .put("id", m.id)
              .put("name", m.fileName)
              .put("url", m.url)
              .put("kind", m.kind))
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
    val metas = loadMeta().toMutableList()
    if (kind == KIND_UPDATE) {
      // Replace any previous update download/file first.
      metas.filter { it.kind == KIND_UPDATE }.forEach { dm.remove(it.id) }
      metas.removeAll { it.kind == KIND_UPDATE }
      dir.listFiles()?.forEach { if (it.name.endsWith(".apk")) it.delete() }
    }
    val request = try {
      DownloadManager.Request(Uri.parse(url))
          .setTitle(if (kind == KIND_UPDATE) "ZShell 更新" else safeName)
          .setDescription("下载完成后可在应用内打开")
          .setNotificationVisibility(
              DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalFilesDir(
              reactContext, Environment.DIRECTORY_DOWNLOADS, safeName)
          .setAllowedOverMetered(true)
          .setAllowedOverRoaming(true)
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
    metas.add(DownloadMeta(id, safeName, url, kind))
    saveMeta(metas)
    promise.resolve(id.toDouble())
  }

  /**
   * All downloads owned by this app uid — ours plus anything the console
   * WebView enqueued — with live status from DownloadManager.
   */
  @ReactMethod
  fun queryDownloads(promise: Promise) {
    try {
      ensureReceiver()
      val metas = loadMeta().associateBy { it.id }
      val cursor = dm.query(DownloadManager.Query())
      val out: WritableArray = Arguments.createArray()
      val liveIds = mutableSetOf<Long>()
      while (cursor.moveToNext()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID))
        liveIds.add(id)
        val meta = metas[id]
        val item: WritableMap = Arguments.createMap()
        item.putDouble("id", id.toDouble())
        val titleIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE)
        item.putString(
            "name", meta?.fileName ?: if (titleIdx >= 0) cursor.getString(titleIdx) else "下载")
        item.putString("kind", meta?.kind ?: KIND_FILE)
        item.putString("url", meta?.url ?: "")

        val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val status = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
        val reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val reason = if (reasonIdx >= 0) cursor.getInt(reasonIdx) else -1
        val bytesIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
        val totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        when (status) {
          DownloadManager.STATUS_PENDING -> item.putString("status", "pending")
          DownloadManager.STATUS_RUNNING -> item.putString("status", "running")
          DownloadManager.STATUS_PAUSED -> item.putString("status", "paused")
          DownloadManager.STATUS_SUCCESSFUL -> item.putString("status", "successful")
          DownloadManager.STATUS_FAILED -> {
            item.putString("status", "failed")
            item.putString("reason", reasonText(reason))
          }
          else -> item.putString("status", "running")
        }
        item.putDouble(
            "bytesSoFar",
            (if (bytesIdx >= 0) cursor.getLong(bytesIdx) else 0L).toDouble())
        item.putDouble(
            "totalBytes",
            (if (totalIdx >= 0) cursor.getLong(totalIdx) else 0L).toDouble())
        out.pushMap(item)
      }
      cursor.close()
      // Drop metadata for downloads the system no longer knows about.
      if (metas.keys.any { it !in liveIds }) {
        saveMeta(loadMeta().filter { it.id in liveIds })
      }
      promise.resolve(out)
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
      val dir = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
      val target = File(dir, name)
      if (target.exists()) {
        target.delete()
      }
    } catch (e: Exception) {
      // cleanup is best-effort
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
  }
}

class ApkInstallerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
      listOf(ApkInstallerModule(reactContext), NotificationsModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
