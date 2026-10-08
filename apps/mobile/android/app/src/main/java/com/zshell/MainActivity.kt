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
}
