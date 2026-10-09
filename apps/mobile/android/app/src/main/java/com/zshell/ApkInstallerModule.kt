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
  fun downloadAndInstall(url: String, promise: Promise) {
    val downloadsDir =
        reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
    if (downloadsDir == null) {
      promise.reject("STORAGE", "外部存储不可用")
      return
    }
    // Clean up previous update downloads first.
    downloadsDir.listFiles()?.forEach { if (it.name.endsWith(".apk")) it.delete() }

    val dm =
        reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val request = DownloadManager.Request(Uri.parse(url))
        .setTitle("ZShell 更新")
        .setDescription("下载完成后自动弹出安装")
        .setNotificationVisibility(
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(
            reactContext, Environment.DIRECTORY_DOWNLOADS, UPDATE_FILE)
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
          val apk = File(downloadsDir, UPDATE_FILE)
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

  companion object {
    private const val UPDATE_FILE = "zshell-update.apk"
  }
}

class ApkInstallerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
      listOf(ApkInstallerModule(reactContext), NotificationsModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
