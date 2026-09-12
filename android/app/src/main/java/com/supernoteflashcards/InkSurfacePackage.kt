package com.supernoteflashcards

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers the handwriting surface.
 *
 * Deliberately separate from FlashcardStoragePackage: that one backs shipped features
 * (the card database, Anki import/export) and there is no reason to touch it to add an
 * experimental one. buildPlugin.sh finds ReactPackage implementations by scanning the
 * project's android/ sources, so a second package needs no build-script change — but it
 * DOES need adding by hand in MainApplication.kt, since in-project packages are not
 * autolinkable.
 */
class InkSurfacePackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(InkSurfaceModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(InkSurfaceViewManager())
}
