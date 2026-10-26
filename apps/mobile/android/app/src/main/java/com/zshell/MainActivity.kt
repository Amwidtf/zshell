package com.zshell

import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ZShell"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Some environments force edge-to-edge (Android 15+ with targetSdk 35+,
   * and Android containers like 卓易通 on HarmonyOS), drawing our content
   * under the status/navigation bars and breaking windowSoftInputMode=
   * adjustResize (the window no longer shrinks for the IME). Re-apply
   * system-bar + cutout + IME insets as padding on the content view so both
   * native UI and the WebView stay fully visible and inputs rise above the
   * keyboard. On normal non-edge-to-edge devices the delivered insets are
   * already consumed and this is a no-op.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // FLAG_SECURE: the console mirrors the user's own machine screens and the
    // lock holds machine credentials, so keep window contents out of the
    // recents/task-switcher preview and off screenshots. Trade-off: the user
    // also cannot screenshot inside the app (standard for banking-style apps).
    window.setFlags(
        android.view.WindowManager.LayoutParams.FLAG_SECURE,
        android.view.WindowManager.LayoutParams.FLAG_SECURE)
    val content = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
          WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val bottom = if (ime.bottom > bars.bottom) ime.bottom else bars.bottom
      v.setPadding(bars.left, bars.top, bars.right, bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  /**
   * Snapshot defense: the recents/task-switcher preview is captured around
   * pause time. The JS-thread relock renders asynchronously — far too late
   * for that snapshot — and some ROMs ignore FLAG_SECURE for previews, so an
   * unlocked screen could still leak into the card right after unlocking.
   * Hiding the window synchronously in onPause blanks it no matter what the
   * ROM does; onResume brings it back (the lock screen has re-rendered by
   * then when the app-lock is enabled).
   */
  override fun onPause() {
    super.onPause()
    window.decorView.visibility = android.view.View.INVISIBLE
  }

  override fun onResume() {
    super.onResume()
    window.decorView.visibility = android.view.View.VISIBLE
  }
}
