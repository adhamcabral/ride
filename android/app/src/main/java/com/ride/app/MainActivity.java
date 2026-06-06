package com.ride.app;

import android.content.ContentValues;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;

public class MainActivity extends BridgeActivity {
    private String pendingSharedPayload = null;
    private String pendingOpenPayload = null;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String torchCameraId = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new RideAndroidBridge(), "RideAndroid");
        }
        captureSharedIntent(getIntent());
        captureOpenIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureSharedIntent(intent);
        captureOpenIntent(intent);
    }

    @Override
    public void onBackPressed() {
        if (bridge == null || bridge.getWebView() == null) {
            super.onBackPressed();
            return;
        }

        String script = "(function(){try{return !!(window.RideAndroidBack && window.RideAndroidBack());}catch(e){return false;}})();";
        bridge.getWebView().evaluateJavascript(script, handled -> {
            if (!"true".equals(handled)) MainActivity.super.onBackPressed();
        });
    }

    private void captureSharedIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        new Thread(() -> {
            try {
                JSONArray files = new JSONArray();
                ArrayList<Uri> uris = sharedUris(intent);
                for (Uri uri : uris) {
                    files.put(readSharedUri(uri, intent.getType()));
                }

                if (files.length() == 0) {
                    CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                    if (text != null && text.length() > 0) {
                        files.put(sharedTextFile(text.toString(), intent.getStringExtra(Intent.EXTRA_SUBJECT)));
                    }
                }

                if (files.length() == 0) return;
                JSONObject payload = new JSONObject();
                payload.put("id", String.valueOf(System.currentTimeMillis()));
                payload.put("files", files);
                pendingSharedPayload = payload.toString();
                dispatchSharedPayload();
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void captureOpenIntent(Intent intent) {
        if (intent == null) return;
        String itemId = intent.getStringExtra("ride_item_id");
        if (itemId == null || itemId.trim().isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("id", itemId);
            pendingOpenPayload = payload.toString();
            dispatchOpenPayload();
        } catch (Exception ignored) {
        }
    }

    private ArrayList<Uri> sharedUris(Intent intent) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        ArrayList<Uri> result = new ArrayList<>();

        Object stream = intent.getExtras() == null ? null : intent.getExtras().get(Intent.EXTRA_STREAM);
        if (stream instanceof Uri) {
            addSharedUri(result, seen, (Uri) stream);
        } else if (stream instanceof ArrayList<?>) {
            for (Object entry : (ArrayList<?>) stream) {
                if (entry instanceof Uri) addSharedUri(result, seen, (Uri) entry);
            }
        }

        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                addSharedUri(result, seen, clipData.getItemAt(index).getUri());
            }
        }

        return result;
    }

    private void addSharedUri(ArrayList<Uri> result, LinkedHashSet<String> seen, Uri uri) {
        if (uri == null) return;
        String key = uri.toString();
        if (seen.contains(key)) return;
        seen.add(key);
        result.add(uri);
    }

    private JSONObject sharedTextFile(String text, String subject) throws Exception {
        String safeSubject = subject == null ? "" : subject.trim().replaceAll("[\\\\/:*?\"<>|]+", "-");
        JSONObject file = new JSONObject();
        file.put("name", safeSubject.isEmpty() ? "texto-compartilhado.txt" : safeSubject + ".txt");
        file.put("mimeType", "text/plain");
        file.put("base64", Base64.encodeToString(text.getBytes("UTF-8"), Base64.NO_WRAP));
        file.put("size", text.getBytes("UTF-8").length);
        return file;
    }

    private JSONObject readSharedUri(Uri uri, String fallbackMimeType) throws Exception {
        byte[] bytes = readAllBytes(uri);
        JSONObject file = new JSONObject();
        file.put("name", displayName(uri));
        file.put("mimeType", mimeType(uri, fallbackMimeType));
        file.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
        file.put("size", bytes.length);
        return file;
    }

    private byte[] readAllBytes(Uri uri) throws Exception {
        try (InputStream input = getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalArgumentException("Arquivo indisponivel.");
            byte[] buffer = new byte[1024 * 64];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value;
                }
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last == null || last.trim().isEmpty() ? "arquivo-compartilhado" : last;
    }

    private String mimeType(Uri uri, String fallback) {
        String type = getContentResolver().getType(uri);
        if (type != null && !type.trim().isEmpty()) return type;
        return fallback == null || fallback.trim().isEmpty() ? "application/octet-stream" : fallback;
    }

    private void dispatchSharedPayload() {
        if (pendingSharedPayload == null) return;
        handler.postDelayed(() -> triggerSharedPayload(false), 500);
        handler.postDelayed(() -> triggerSharedPayload(false), 2000);
        handler.postDelayed(() -> triggerSharedPayload(true), 3200);
    }

    private void triggerSharedPayload(boolean clear) {
        if (pendingSharedPayload == null || bridge == null) return;
        bridge.triggerWindowJSEvent("ride-shared-files", pendingSharedPayload);
        if (clear) pendingSharedPayload = null;
    }

    private void dispatchOpenPayload() {
        if (pendingOpenPayload == null) return;
        handler.postDelayed(() -> triggerOpenPayload(false), 500);
        handler.postDelayed(() -> triggerOpenPayload(false), 2000);
        handler.postDelayed(() -> triggerOpenPayload(false), 5000);
        handler.postDelayed(() -> triggerOpenPayload(false), 10000);
        handler.postDelayed(() -> triggerOpenPayload(true), 20000);
    }

    private void triggerOpenPayload(boolean clear) {
        if (pendingOpenPayload == null || bridge == null) return;
        bridge.triggerWindowJSEvent("ride-open-item", pendingOpenPayload);
        if (clear) pendingOpenPayload = null;
    }

    private class RideAndroidBridge {
        @JavascriptInterface
        public String consumeOpenPayload() {
            String payload = pendingOpenPayload;
            pendingOpenPayload = null;
            return payload == null ? "" : payload;
        }

        @JavascriptInterface
        public boolean setTorch(boolean enabled) {
            try {
                CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                String cameraId = torchCameraId(manager);
                if (cameraId == null) return false;
                manager.setTorchMode(cameraId, enabled);
                return true;
            } catch (Exception exception) {
                return false;
            }
        }

        @JavascriptInterface
        public void saveBase64(String payload) {
            new Thread(() -> {
                String id = "";
                String name = "download";
                try {
                    JSONObject input = new JSONObject(payload);
                    id = input.optString("id", "");
                    name = sanitizeFileName(input.optString("name", "download"));
                    String mimeType = input.optString("mimeType", "application/octet-stream");
                    String base64 = input.optString("base64", "");
                    if (base64.contains(",")) base64 = base64.substring(base64.indexOf(",") + 1);
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    Uri uri = saveDownload(name, mimeType, bytes);

                    JSONObject result = new JSONObject();
                    result.put("id", id);
                    result.put("name", name);
                    result.put("uri", uri == null ? "" : uri.toString());
                    triggerWindowEvent("ride-download-complete", result);
                } catch (Exception exception) {
                    try {
                        JSONObject result = new JSONObject();
                        result.put("id", id);
                        result.put("name", name);
                        result.put("message", exception.getMessage() == null ? "Nao foi possivel salvar o download." : exception.getMessage());
                        triggerWindowEvent("ride-download-error", result);
                    } catch (Exception ignored) {
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void shareBase64(String payload) {
            new Thread(() -> {
                String id = "";
                String name = "arquivo";
                try {
                    JSONObject input = new JSONObject(payload);
                    id = input.optString("id", "");
                    name = sanitizeFileName(input.optString("name", "arquivo"));
                    String mimeType = input.optString("mimeType", "application/octet-stream");
                    String base64 = input.optString("base64", "");
                    if (base64.contains(",")) base64 = base64.substring(base64.indexOf(",") + 1);
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    Uri uri = writeShareCacheFile(name, bytes);

                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.putExtra(Intent.EXTRA_TITLE, name);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newUri(getContentResolver(), name, uri));
                    Intent chooser = Intent.createChooser(send, "Enviar uma copia");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    handler.post(() -> startActivity(chooser));
                } catch (Exception exception) {
                    try {
                        JSONObject result = new JSONObject();
                        result.put("id", id);
                        result.put("name", name);
                        result.put("message", exception.getMessage() == null ? "Nao foi possivel compartilhar." : exception.getMessage());
                        triggerWindowEvent("ride-share-error", result);
                    } catch (Exception ignored) {
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void requestShortcut(String payload) {
            try {
                JSONObject input = new JSONObject(payload);
                String id = input.optString("id", "");
                String name = sanitizeShortcutName(input.optString("name", "Ride"));
                String type = input.optString("type", "");
                String mimeType = input.optString("mimeType", "");
                String extension = input.optString("extension", "");
                if (id.trim().isEmpty()) throw new IllegalArgumentException("Item invalido.");
                Intent shortcutIntent = new Intent(MainActivity.this, MainActivity.class);
                shortcutIntent.setAction(Intent.ACTION_VIEW);
                shortcutIntent.putExtra("ride_item_id", id);
                shortcutIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                Bitmap iconBitmap = shortcutIconBitmap(type, mimeType, extension, name);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ShortcutManager manager = getSystemService(ShortcutManager.class);
                    if (manager == null || !manager.isRequestPinShortcutSupported()) {
                        throw new IllegalStateException("Launcher nao suporta atalhos fixados.");
                    }
                    ShortcutInfo shortcut = new ShortcutInfo.Builder(MainActivity.this, "ride-" + id)
                        .setShortLabel(name)
                        .setLongLabel(name)
                        .setIcon(Icon.createWithBitmap(iconBitmap))
                        .setIntent(shortcutIntent)
                        .build();
                    manager.requestPinShortcut(shortcut, null);
                } else {
                    Intent install = new Intent("com.android.launcher.action.INSTALL_SHORTCUT");
                    install.putExtra(Intent.EXTRA_SHORTCUT_INTENT, shortcutIntent);
                    install.putExtra(Intent.EXTRA_SHORTCUT_NAME, name);
                    install.putExtra(Intent.EXTRA_SHORTCUT_ICON, iconBitmap);
                    install.putExtra("duplicate", false);
                    sendBroadcast(install);
                }

                JSONObject result = new JSONObject();
                result.put("id", id);
                result.put("name", name);
                result.put("message", "Atalho enviado para a tela inicial.");
                triggerWindowEvent("ride-shortcut-result", result);
            } catch (Exception exception) {
                try {
                    JSONObject result = new JSONObject();
                    result.put("message", exception.getMessage() == null ? "Nao foi possivel criar o atalho." : exception.getMessage());
                    triggerWindowEvent("ride-shortcut-error", result);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private String torchCameraId(CameraManager manager) throws Exception {
        if (torchCameraId != null) return torchCameraId;
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
            Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
            if (Boolean.TRUE.equals(hasFlash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                torchCameraId = id;
                return id;
            }
        }
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
            Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            if (Boolean.TRUE.equals(hasFlash)) {
                torchCameraId = id;
                return id;
            }
        }
        return null;
    }

    private Uri saveDownload(String name, String mimeType, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Ride");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri uri = getContentResolver().insert(collection, values);
            if (uri == null) throw new IllegalStateException("Download indisponivel.");

            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("Nao foi possivel abrir o arquivo.");
                output.write(bytes);
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
            return uri;
        }

        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Ride");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Nao foi possivel criar a pasta de downloads.");
        File file = uniqueFile(directory, name);
        try (OutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        Intent scan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
        Uri uri = Uri.fromFile(file);
        scan.setData(uri);
        sendBroadcast(scan);
        return uri;
    }

    private Uri writeShareCacheFile(String name, byte[] bytes) throws Exception {
        File directory = new File(getCacheDir(), "ride-share");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Nao foi possivel preparar o compartilhamento.");
        File[] staleFiles = directory.listFiles();
        if (staleFiles != null) {
            long cutoff = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
            for (File file : staleFiles) {
                if (file.lastModified() < cutoff) file.delete();
            }
        }
        File file = uniqueFile(directory, name);
        try (OutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
    }

    private File uniqueFile(File directory, String name) {
        File file = new File(directory, name);
        if (!file.exists()) return file;
        String base = name;
        String extension = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            base = name.substring(0, dot);
            extension = name.substring(dot);
        }
        int index = 1;
        while (file.exists()) {
            file = new File(directory, base + " (" + index + ")" + extension);
            index += 1;
        }
        return file;
    }

    private String sanitizeFileName(String name) {
        String safe = name == null ? "" : name.trim().replaceAll("[\\\\/:*?\"<>|\\n\\r]+", "-");
        return safe.isEmpty() ? "download" : safe;
    }

    private String sanitizeShortcutName(String name) {
        String safe = name == null ? "" : name.trim().replaceAll("[\\n\\r]+", " ");
        if (safe.isEmpty()) return "Ride";
        return safe.length() > 28 ? safe.substring(0, 28) : safe;
    }

    private Bitmap shortcutIconBitmap(String type, String mimeType, String extension, String name) {
        int size = 144;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        String kind = shortcutKind(type, mimeType, extension, name);

        if ("folder".equals(kind)) {
            paint.setColor(Color.rgb(251, 188, 4));
            canvas.drawRoundRect(new RectF(18f, 36f, 70f, 58f), 10f, 10f, paint);
            canvas.drawRoundRect(new RectF(14f, 48f, 130f, 116f), 16f, 16f, paint);
            paint.setColor(Color.rgb(245, 166, 35));
            canvas.drawRect(14f, 62f, 130f, 75f, paint);
            return bitmap;
        }

        String label = shortcutLabel(kind);
        int accent = shortcutColor(kind);
        paint.setColor(Color.WHITE);
        canvas.drawRoundRect(new RectF(25f, 12f, 119f, 132f), 16f, 16f, paint);
        paint.setColor(Color.rgb(232, 234, 237));
        canvas.drawRoundRect(new RectF(88f, 12f, 119f, 43f), 8f, 8f, paint);
        paint.setColor(accent);
        canvas.drawRoundRect(new RectF(34f, 78f, 110f, 110f), 8f, 8f, paint);
        paint.setColor(Color.WHITE);
        paint.setTypeface(Typeface.DEFAULT_BOLD);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(label.length() > 3 ? 21f : 24f);
        canvas.drawText(label, 72f, 101f, paint);
        return bitmap;
    }

    private String shortcutKind(String type, String mimeType, String extension, String name) {
        if ("folder".equalsIgnoreCase(type)) return "folder";
        String mime = mimeType == null ? "" : mimeType.toLowerCase();
        String ext = shortcutExtension(extension, name);
        if ("pdf".equals(ext) || mime.contains("pdf")) return "pdf";
        if ("doc".equals(ext) || "docx".equals(ext) || mime.contains("word") || mime.contains("document")) return "doc";
        if ("xls".equals(ext) || "xlsx".equals(ext) || mime.contains("sheet") || mime.contains("excel")) return "xls";
        if ("ppt".equals(ext) || "pptx".equals(ext) || mime.contains("presentation") || mime.contains("powerpoint")) return "ppt";
        if (mime.startsWith("image/") || "jpg".equals(ext) || "jpeg".equals(ext) || "png".equals(ext) || "gif".equals(ext) || "webp".equals(ext) || "heic".equals(ext)) return "img";
        if (mime.startsWith("video/") || "mp4".equals(ext) || "mov".equals(ext) || "mkv".equals(ext) || "webm".equals(ext)) return "video";
        if (mime.startsWith("audio/") || "mp3".equals(ext) || "wav".equals(ext) || "m4a".equals(ext) || "ogg".equals(ext)) return "audio";
        if ("zip".equals(ext) || "rar".equals(ext) || "7z".equals(ext) || mime.contains("zip") || mime.contains("compressed")) return "zip";
        if ("txt".equals(ext) || "md".equals(ext) || mime.startsWith("text/")) return "txt";
        if ("html".equals(ext) || "css".equals(ext) || "js".equals(ext) || "json".equals(ext) || "xml".equals(ext)) return "code";
        return "file";
    }

    private String shortcutExtension(String extension, String name) {
        String ext = extension == null ? "" : extension.trim().toLowerCase();
        if (ext.startsWith(".")) ext = ext.substring(1);
        if (!ext.isEmpty() && ext.length() <= 8) return ext;
        String source = name == null ? "" : name;
        int dot = source.lastIndexOf('.');
        return dot >= 0 && dot < source.length() - 1 ? source.substring(dot + 1).toLowerCase() : "";
    }

    private String shortcutLabel(String kind) {
        if ("pdf".equals(kind)) return "PDF";
        if ("doc".equals(kind)) return "DOC";
        if ("xls".equals(kind)) return "XLS";
        if ("ppt".equals(kind)) return "PPT";
        if ("img".equals(kind)) return "IMG";
        if ("video".equals(kind)) return "VID";
        if ("audio".equals(kind)) return "AUD";
        if ("zip".equals(kind)) return "ZIP";
        if ("txt".equals(kind)) return "TXT";
        if ("code".equals(kind)) return "CODE";
        return "FILE";
    }

    private int shortcutColor(String kind) {
        if ("pdf".equals(kind)) return Color.rgb(234, 67, 53);
        if ("doc".equals(kind)) return Color.rgb(66, 133, 244);
        if ("xls".equals(kind)) return Color.rgb(52, 168, 83);
        if ("ppt".equals(kind)) return Color.rgb(251, 188, 4);
        if ("img".equals(kind)) return Color.rgb(156, 39, 176);
        if ("video".equals(kind)) return Color.rgb(0, 150, 136);
        if ("audio".equals(kind)) return Color.rgb(233, 30, 99);
        if ("zip".equals(kind)) return Color.rgb(95, 99, 104);
        if ("txt".equals(kind)) return Color.rgb(25, 103, 210);
        if ("code".equals(kind)) return Color.rgb(32, 33, 36);
        return Color.rgb(95, 99, 104);
    }

    private void triggerWindowEvent(String eventName, JSONObject payload) {
        handler.post(() -> {
            if (bridge == null) return;
            bridge.triggerWindowJSEvent(eventName, payload.toString());
        });
    }
}
