package com.zshell

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File

/**
 * In-app update downloader backed by the system DownloadManager (no extra
 * third-party dependency). Downloads the APK into the app's external files
 * dir, shows progress in the system notification, and hands the file to the
 * system installer via FileProvider when the download completes.
 */
class ApkInstallerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ApkInstaller"

  @ReactMethod
  fun downloadAndInstall(url: String, version: String, promise: Promise) {
    val downloadsDir =
        reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
    if (downloadsDir == null) {
      promise.reject("STORAGE", "外部存储不可用")
      return
    }
    // Clean up previous update downloads first.
    downloadsDir.listFiles()?.forEach { if (it.name.endsWith(".apk")) it.delete() }

    val fileName = "zshell-update-$version.apk"
    val dm =
        reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val request = DownloadManager.Request(Uri.parse(url))
        .setTitle("ZShell 更新")
        .setDescription("下载完成后自动弹出安装")
        .setNotificationVisibility(
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(
            reactContext, Environment.DIRECTORY_DOWNLOADS, fileName)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)

    val downloadId: Long
    try {
      downloadId = dm.enqueue(request)
    } catch (e: Exception) {
      promise.reject("ENQUEUE", e.message ?: "无法开始下载", e)
      return
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) {
          return
        }
        try {
          reactContext.unregisterReceiver(this)
          if (dm.getUriForDownloadedFile(downloadId) == null) {
            promise.reject("DOWNLOAD", "下载失败")
            return
          }
          val apk = File(downloadsDir, fileName)
          val uri = FileProvider.getUriForFile(
              reactContext, "${reactContext.packageName}.fileprovider", apk)
          val install = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          reactContext.startActivity(install)
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("INSTALL", e.message ?: "安装失败", e)
        }
      }
    }
    reactContext.registerReceiver(
        receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
  }

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
      if (!name.startsWith("zshell-update-") || !name.endsWith(".apk")) {
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

  companion object {
    private const val UPDATE_PREFIX = "zshell-update-"
  }
}

class ApkInstallerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
      listOf(ApkInstallerModule(reactContext), NotificationsModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
