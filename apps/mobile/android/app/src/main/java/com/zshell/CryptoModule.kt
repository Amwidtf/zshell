package com.zshell

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

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

  /**
   * PBKDF2-HMAC-SHA256 over raw bytes (RFC 2898). The JS-side pure-TS
   * implementation blocks the JS thread for seconds at 20k iterations (enough
   * to trip the Android ANR watchdog on mid-range phones), so the app-lock
   * set/verify paths run here instead. Must stay byte-for-byte identical to
   * packages/core-shell/src/crypto.ts pbkdf2Sha256 — verifiers saved by older
   * builds (hashed in JS) keep verifying.
   */
  @ReactMethod
  fun pbkdf2Sha256Base64(
      passwordB64: String,
      saltB64: String,
      iterations: Double,
      dkLen: Double,
      promise: Promise
  ) {
    try {
      val password = Base64.decode(passwordB64, Base64.NO_WRAP)
      val salt = Base64.decode(saltB64, Base64.NO_WRAP)
      val iters = iterations.toInt().coerceIn(1, 1_000_000)
      val outLen = dkLen.toInt().coerceIn(1, 512)
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(SecretKeySpec(password, "HmacSHA256"))
      val blocks = (outLen + 31) / 32
      val out = ByteArray(blocks * 32)
      for (i in 1..blocks) {
        var u = mac.doFinal(
            salt +
                byteArrayOf(
                    (i ushr 24).toByte(),
                    (i ushr 16).toByte(),
                    (i ushr 8).toByte(),
                    i.toByte()))
        val t = u.copyOf()
        for (iter in 1 until iters) {
          u = mac.doFinal(u)
          for (j in t.indices) {
            t[j] = (t[j].toInt() xor u[j].toInt()).toByte()
          }
        }
        System.arraycopy(t, 0, out, (i - 1) * 32, 32)
      }
      val result = if (outLen == out.size) out else out.copyOf(outLen)
      promise.resolve(Base64.encodeToString(result, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("PBKDF2", e.message ?: "密钥派生失败", e)
    }
  }
}
