package com.supernoteflashcards

import android.view.View
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Handwritten guesses, drawn by the firmware's own pen engine.
 *
 * `android.view.View.getPWInterFace()` is hiddenapi-flagged `sdk` and PluginHost runs as
 * uid 1000, so a plugin can obtain the vendor's `PWCoreCtrl` and get native-latency ink at
 * full panel size. Verified on-device; the full write-up, including the `.tch` format and
 * the constants used below, is in
 * `~/supernote-plugins/references/firmware-pen-engine-einkpwinterface.md`.
 *
 * This is undocumented vendor reflection on a shipping plugin, so **every entry point
 * fails soft**. [isAvailable] is what the UI asks before offering handwriting at all; if a
 * firmware update removes any of it, the Guess field silently stays a TextInput.
 *
 * Nothing is persisted. The guess lives in the engine's buffer until the card is rated,
 * which is also why none of the `.tch` save/reload path is used here.
 */
class InkSurfaceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "InkSurface"

    /** React instance going away — never leave the engine running behind it. */
    override fun invalidate() {
        release("react instance torn down")
        super.invalidate()
    }

    companion object {
        // EinkPWInterface constants, decompiled from this firmware rather than guessed.
        private const val PENTYPE_PEN_1 = 2
        private const val DRAWOBJ_FREEHAND = 0
        private const val PENCOLOR_BLACK = -16777216

        /** Route touches through the host with low latency so buttons still work. */
        private const val DISPATH_TOUCH_HOST_LATER = 2

        /**
         * The engine's own default std width is 4.4, which draws a ~4px stroke on an
         * 1875px panel — too thin to write with. 10 reads as a normal pen.
         * MAX_PEN_WIDTH_PIXEL is 10 but does not actually clamp; 16 is heavy, 24 too thick.
         */
        const val DEFAULT_PEN_WIDTH = 10.0f

        @Volatile private var engine: Any? = null

        /**
         * Stop the engine from anywhere without minting one.
         *
         * Every path out has to come through here — host unmount, module teardown, leaving
         * the study screen, plugin close. `getPWInterFace()` is a factory, so this must
         * never call it just to turn something off.
         */
        fun release(reason: String): String {
            val e = engine ?: return "nothing active"
            val r = runCatching {
                e.javaClass.getMethod("setPWEnabled", java.lang.Boolean.TYPE).invoke(e, false)
            }
            engine = null
            android.util.Log.i("InkSurface", "released: $reason")
            return if (r.isSuccess) "released" else "release threw: ${r.exceptionOrNull()?.cause}"
        }
    }

    /**
     * Can this firmware do handwriting at all?
     *
     * Resolution only — nothing is constructed, so this is safe to call on every study
     * screen. The UI hides the ink surface entirely when it returns false.
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        val ok = runCatching {
            View::class.java.getMethod("getPWInterFace")
            Class.forName("android.view.EinkPWInterface")
            true
        }.getOrDefault(false)
        promise.resolve(ok)
    }

    /**
     * Bind the engine to the mounted surface and start accepting pen input.
     *
     * Finger input is OFF: the engine then takes only TOOL_TYPE_STYLUS, which is what
     * gives palm rejection. With it on, a resting hand draws and the panel's own buttons
     * become unusable.
     */
    @ReactMethod
    fun activate(penType: Int, penWidth: Double, penColor: Int, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val host = InkSurfaceViewManager.current
            if (host == null) {
                promise.resolve("no-surface"); return@runOnUiThread
            }
            if (host.width == 0 || host.height == 0) {
                // Laid out on the next frame; the caller retries rather than binding an
                // engine to a 0x0 writing bitmap.
                promise.resolve("not-laid-out"); return@runOnUiThread
            }

            val e = engine ?: runCatching {
                View::class.java.getMethod("getPWInterFace").invoke(host)
            }.getOrNull()
            if (e == null) {
                promise.resolve("no-engine"); return@runOnUiThread
            }
            engine = e

            // Force the engine to re-read where its host actually is.
            //
            // The writable region is derived from the host's position in the window when
            // the engine binds. Reusing an instance across cards left that stale, which
            // showed up as a dead band in the middle of the surface and then, once the
            // offset exceeded the surface height, no writable area at all. Changing pen
            // type appeared to "fix" it only because that re-ran activation.
            runCatching { e.javaClass.getMethod("onWindowChanged").invoke(e) }
                .onFailure { android.util.Log.w("InkSurface", "onWindowChanged: ${it.cause ?: it}") }
            // Stale fences would also carve out unwritable regions; we set none, but the
            // instance is shared and cheap to clean.
            runCatching { e.javaClass.getMethod("clearUnWriteRectList").invoke(e) }

            set(e, "setPenType", Integer.TYPE, if (penType > 0) penType else PENTYPE_PEN_1)
            set(e, "setDrawObjectType", Integer.TYPE, DRAWOBJ_FREEHAND)
            set(e, "setPenStdWidth", java.lang.Float.TYPE,
                if (penWidth > 0) penWidth.toFloat() else DEFAULT_PEN_WIDTH)
            set(e, "setPenColor", Integer.TYPE, if (penColor != 0) penColor else PENCOLOR_BLACK)
            // Deliberately NOT forcing anti-aliasing off.
            //
            // NOANTI gives the crispest edges on a 16-grey panel, but it also flattened
            // every pen type into the same stroke — the texture that distinguishes a
            // pencil or brush from a pen lives in its anti-aliasing. Each PENTYPE_* brings
            // its own default, so leave it alone and let the types actually differ.
            set(e, "setFingerWritable", java.lang.Boolean.TYPE, false)
            // The erase dwell indicator ghosts badly on e-ink.
            set(e, "disablePenEraseFloatFlower", java.lang.Boolean.TYPE, true)
            set(e, "enableTouchDispatch", Integer.TYPE, DISPATH_TOUCH_HOST_LATER)
            set(e, "disablePWInput", java.lang.Boolean.TYPE, false)

            val on = runCatching {
                e.javaClass.getMethod("setPWEnabled", java.lang.Boolean.TYPE).invoke(e, true)
            }

            // Clear AFTER binding, not when the previous card was rated.
            //
            // clearContentX empties the engine's stroke model, but the ink is already
            // rasterised into the host — and the disable/re-enable cycle between cards
            // brought the old strokes back on screen. Clearing here is the only point that
            // is guaranteed to be after everything which could restore them. Then force a
            // repaint, because emptying the model does not by itself repaint the host.
            runCatching {
                e.javaClass.getMethod("clearContentX", java.lang.Boolean.TYPE).invoke(e, true)
            }.onFailure { android.util.Log.w("InkSurface", "clear on bind: ${it.cause ?: it}") }
            runCatching {
                e.javaClass.getMethod("invalidateHost", android.graphics.Rect::class.java)
                    .invoke(e, android.graphics.Rect(0, 0, host.width, host.height))
            }
            host.invalidate()

            // setPWEnabled returns void, so invoke() gives null on success — success is
            // "did not throw", never "returned non-null".
            promise.resolve(if (on.isSuccess) "active" else "enable-failed")
        }
    }

    /**
     * Freeze the ink without erasing it, for when the answer is showing.
     *
     * Deliberately not [release]: the strokes are rasterised into the host's bitmap and
     * must stay visible next to the answer for comparison. This only stops new input.
     */
    @ReactMethod
    fun freeze(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val e = engine
            if (e == null) { promise.resolve("inactive"); return@runOnUiThread }
            val r = runCatching {
                e.javaClass.getMethod("disablePWInput", java.lang.Boolean.TYPE).invoke(e, true)
            }
            promise.resolve(if (r.isSuccess) "frozen" else "freeze-failed")
        }
    }

    /** Wipe the surface — called when a card is rated, so the next one starts clean. */
    @ReactMethod
    fun clear(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val e = engine
            if (e == null) { promise.resolve("inactive"); return@runOnUiThread }
            val r = runCatching {
                e.javaClass.getMethod("clearContentX", java.lang.Boolean.TYPE).invoke(e, true)
            }
            runCatching {
                e.javaClass.getMethod("disablePWInput", java.lang.Boolean.TYPE).invoke(e, false)
            }
            // Emptying the model does not repaint the host on its own.
            InkSurfaceViewManager.current?.let { host ->
                runCatching {
                    e.javaClass.getMethod("invalidateHost", android.graphics.Rect::class.java)
                        .invoke(e, android.graphics.Rect(0, 0, host.width, host.height))
                }
                host.invalidate()
            }
            promise.resolve(if (r.isSuccess) "cleared" else "clear-failed")
        }
    }

    /** Has anything been written? Used to skip the comparison view for an empty guess. */
    @ReactMethod
    fun hasInk(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val e = engine
            if (e == null) { promise.resolve(false); return@runOnUiThread }
            // Stroke count, not undo depth: getAvailableUndo is the undo stack and caps
            // independently of the model.
            val n = runCatching {
                e.javaClass.getMethod("getAvailableRepaintStep").invoke(e) as? Int
            }.getOrNull() ?: 0
            promise.resolve(n > 0)
        }
    }

    @ReactMethod
    fun deactivate(promise: Promise) {
        UiThreadUtil.runOnUiThread { promise.resolve(release("study screen left")) }
    }

    private fun set(engine: Any, name: String, type: Class<*>, value: Any) {
        runCatching { engine.javaClass.getMethod(name, type).invoke(engine, value) }
            .onFailure { android.util.Log.w("InkSurface", "$name failed: ${it.cause ?: it}") }
    }
}
