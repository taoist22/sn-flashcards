package com.supernoteflashcards;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class FlashcardStorageModule extends ReactContextBaseJavaModule {
    private static final String FILE_NAME = "flashcards-db.json";
    private final ReactApplicationContext reactContext;

    FlashcardStorageModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() {
        return "FlashcardStorage";
    }

    @ReactMethod
    public void readDatabase(Promise promise) {
        try {
            File file = new File(reactContext.getFilesDir(), FILE_NAME);
            if (!file.exists()) {
                promise.resolve(null);
                return;
            }

            byte[] bytes = new byte[(int) file.length()];
            FileInputStream input = new FileInputStream(file);
            try {
                int read = input.read(bytes);
                if (read < 0) {
                    promise.resolve("");
                    return;
                }
                promise.resolve(new String(bytes, 0, read, StandardCharsets.UTF_8));
            } finally {
                input.close();
            }
        } catch (Exception error) {
            promise.reject("FLASHCARD_READ_FAILED", error);
        }
    }

    @ReactMethod
    public void writeDatabase(String json, Promise promise) {
        try {
            File file = new File(reactContext.getFilesDir(), FILE_NAME);
            FileOutputStream output = new FileOutputStream(file, false);
            try {
                output.write(json.getBytes(StandardCharsets.UTF_8));
                output.flush();
                promise.resolve(true);
            } finally {
                output.close();
            }
        } catch (Exception error) {
            promise.reject("FLASHCARD_WRITE_FAILED", error);
        }
    }
}
