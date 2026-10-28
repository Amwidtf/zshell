package com.zshell

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Settings bridge for the recents-mask / screenshot trade-off (the mechanism
 * and its OS-level constraint are documented in MainActivity.applyWindowPrivacy).
 */
class PrivacyWindowModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ZShellPrivacyWindow"

  @ReactMethod
  fun getRecentsMaskEnabled(promise: Promise) {
    promise.resolve(MainActivity.recentsMaskEnabled(reactApplicationContext))
  }

  @ReactMethod
  fun setRecentsMaskEnabled(enabled: Boolean) {
    reactApplicationContext
        .getSharedPreferences(MainActivity.PRIVACY_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(MainActivity.KEY_RECENTS_MASK, enabled)
        .apply()
    val activity = reactApplicationContext.currentActivity
    if (activity is MainActivity) {
      activity.runOnUiThread { activity.applyWindowPrivacy() }
    }
  }
}
