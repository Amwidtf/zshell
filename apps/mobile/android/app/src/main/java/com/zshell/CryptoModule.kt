package com.zshell

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.SecureRandom

/** Secure-random bytes for salts (JS Math.random is not a CSPRNG). */
class CryptoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ZShellCrypto"

  @ReactMethod
  fun secureRandomBase64(count: Double, promise: Promise) {
    try {
      val n = count.toInt().coerceIn(1, 256)
      val bytes = ByteArray(n)
      SecureRandom().nextBytes(bytes)
      promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("RANDOM", e.message ?: "无法生成随机数", e)
    }
  }
}
