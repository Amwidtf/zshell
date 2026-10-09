package com.zshell

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Minimal local-notification module (no third-party dependency): one channel,
 * fire-and-forget notifies driven by the console status bridge. Permission
 * requests are handled on the JS side via PermissionsAndroid.
 */
class NotificationsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ZShellNotifications"

  @ReactMethod
  fun areEnabled(promise: Promise) {
    val nm =
        reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    promise.resolve(nm.areNotificationsEnabled())
  }

  @ReactMethod
  fun notify(id: Double, title: String, body: String) {
    try {
      val nm =
          reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel =
            NotificationChannel(
                CHANNEL_ID, "会话状态", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "连接断开、等待批准等状态提醒"
        nm.createNotificationChannel(channel)
      }
      if (!nm.areNotificationsEnabled()) {
        return
      }
      val notification =
          NotificationCompat.Builder(reactContext, CHANNEL_ID)
              .setSmallIcon(android.R.drawable.stat_notify_chat)
              .setContentTitle(title)
              .setContentText(body)
              .setStyle(NotificationCompat.BigTextStyle().bigText(body))
              .setAutoCancel(true)
              .build()
      nm.notify(id.toInt(), notification)
    } catch (e: Exception) {
      // Notifications are best-effort; never crash the app for them.
    }
  }

  companion object {
    private const val CHANNEL_ID = "zshell_status"
  }
}
