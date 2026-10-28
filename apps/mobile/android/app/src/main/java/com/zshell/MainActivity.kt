package com.zshell

import android.content.Context
import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  companion object {
    const val PRIVACY_PREFS = "zshell_window_privacy"
    const val KEY_RECENTS_MASK = "recents_mask"

    /** The recents mask defaults to on; only the settings toggle may disable it. */
    @JvmStatic
    fun recentsMaskEnabled(context: Context): Boolean =
        context.getSharedPreferences(PRIVACY_PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_RECENTS_MASK, true)
  }

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
   * Recents/task-switcher privacy vs in-app screenshots. The console mirrors the
   * user's own machine screens, so the recents preview must not leak it — but the
   * user must also be able to screenshot their own console. Below Android 16 the
   * OS routes both captures through the same window flag (FLAG_SECURE), and the
   * task snapshot is taken when the transition to recents STARTS — before
   * onPause — so raising the flag "on the way out" is always too late (verified
   * on Android 15). API 36 separates the two: setRecentsScreenshotEnabled(false)
   * masks the preview without touching screenshots. On older versions the user
   * picks the priority in settings: mask on => always-secure window (in-app
   * screenshots blocked, like banking apps); mask off => screenshots work and
   * the preview shows content.
   */
  fun applyWindowPrivacy() {
    val mask = recentsMaskEnabled(this)
    if (android.os.Build.VERSION.SDK_INT >= 36) { // BAKLAVA
      setRecentsScreenshotEnabled(!mask)
      window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    } else if (mask) {
      window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

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
    applyWindowPrivacy()
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
   * Snapshot defense: hiding the window at pause time blanks the recents
   * preview on ROMs that ignore FLAG_SECURE for previews. It is only an extra
   * layer — on stock Android 15 the snapshot reads the surface's last retained
   * frame, so the real protection is FLAG_SECURE being applied for the whole
   * visible lifetime (see applyWindowPrivacy). The JS-thread relock renders
   * asynchronously — far too late for that snapshot — which is why this must
   * happen natively at pause time.
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
