package com.supernoteflashcards

import android.graphics.Color
import android.view.View
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/**
 * Host view for the firmware pen engine, rendered from JSX as `<InkSurface />`.
 *
 * It has to come from a ViewManager rather than being attached in native code: the engine
 * sizes its writing bitmap from the host's MEASURED dimensions, and a view attached
 * natively is never laid out — it reports 0x0 and the engine gets a 0x0 ink buffer.
 *
 * MUST stay a plain `View`. `PWCoreCtrl`'s constructor calls
 * `hostView.getOverlay().add(drawable)`, which SurfaceView does not support.
 *
 * Give it a FIXED height in JS and never let anything above it change height while the
 * engine is live — a host that moves or resizes makes ink jump and reallocates the
 * writing bitmap mid-stroke.
 */
class InkSurfaceViewManager : SimpleViewManager<View>() {

    override fun getName() = "InkSurface"

    override fun createViewInstance(context: ThemedReactContext): View {
        val v = View(context)
        v.setBackgroundColor(Color.WHITE)
        current = v
        return v
    }

    /**
     * React is unmounting the host — stop the engine before losing the reference.
     *
     * An engine left enabled against a detached view wedges PluginHost: the plugin then
     * refuses to load with a misleading "not compatible with the current system version"
     * and the device needs a reboot.
     */
    override fun onDropViewInstance(view: View) {
        if (current === view) {
            InkSurfaceModule.release("ink host unmounted")
            current = null
        }
        super.onDropViewInstance(view)
    }

    companion object {
        @Volatile
        var current: View? = null
            private set
    }
}
