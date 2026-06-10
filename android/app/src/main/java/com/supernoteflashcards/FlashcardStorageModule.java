package com.supernoteflashcards;

import android.os.Environment;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;

import java.util.ArrayDeque;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

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
            writeFile(file, json);
            promise.resolve(true);
        } catch (Exception error) {
            promise.reject("FLASHCARD_WRITE_FAILED", error);
        }
    }

    @ReactMethod
    public void readTextFile(String path, Promise promise) {
        try {
            File file = new File(path);
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
            promise.reject("FLASHCARD_READ_TEXT_FAILED", error);
        }
    }

    @ReactMethod
    public void writeTextFile(String path, String text, Promise promise) {
        try {
            File file = new File(path);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }
            writeFile(file, text);
            promise.resolve(true);
        } catch (Exception error) {
            promise.reject("FLASHCARD_WRITE_TEXT_FAILED", error);
        }
    }

    @ReactMethod
    public void listImportTextFiles(Promise promise) {
        try {
            WritableArray result = Arguments.createArray();
            File root = Environment.getExternalStorageDirectory();
            String[] folderNames = {
                    "MyStyle",
                    "EXPORT",
                    "Document",
                    "Documents",
                    "INBOX",
                    "Download",
                    "Downloads",
                    "Note"
            };

            for (String folderName : folderNames) {
                scanTextFiles(new File(root, folderName), result);
            }
            scanTextFiles(new File(reactContext.getFilesDir(), "sn-flashcards"), result);
            promise.resolve(result);
        } catch (Exception error) {
            promise.reject("FLASHCARD_LIST_IMPORT_FILES_FAILED", error);
        }
    }

    private void writeFile(File file, String text) throws Exception {
        FileOutputStream output = new FileOutputStream(file, false);
        try {
            output.write(text.getBytes(StandardCharsets.UTF_8));
            output.flush();
        } finally {
            output.close();
        }
    }

    private void scanTextFiles(File root, WritableArray result) {
        if (root == null || !root.exists()) {
            return;
        }

        ArrayDeque<File> queue = new ArrayDeque<>();
        queue.add(root);
        int found = 0;
        int visited = 0;

        while (!queue.isEmpty() && found < 500 && visited < 5000) {
            File current = queue.removeFirst();
            visited++;

            if (current.isFile()) {
                String name = current.getName().toLowerCase(Locale.US);
                if (name.endsWith(".txt") || name.endsWith(".tsv") || name.endsWith(".csv")) {
                    result.pushString(current.getAbsolutePath());
                    found++;
                }
                continue;
            }

            File[] children = current.listFiles();
            if (children == null) {
                continue;
            }

            for (File child : children) {
                queue.add(child);
            }
        }
    }
}
