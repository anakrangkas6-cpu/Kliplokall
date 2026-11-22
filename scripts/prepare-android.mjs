import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  const requiredPermissions = [
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  ];

  const missing = requiredPermissions.filter(
    (perm) => !manifest.includes(perm.split('"')[1])
  );

  if (missing.length > 0) {
    manifest = manifest.replace(
      '<application',
      `${missing.join('\n    ')}\n\n    <application`
    );
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('Added Android media/storage permissions to AndroidManifest.xml');
  }
}

// Ensure FileProvider file_paths.xml allows sharing external downloads on older Android versions
const filePathsXml = path.resolve('android/app/src/main/res/xml/file_paths.xml');
if (fs.existsSync(filePathsXml)) {
  let xml = fs.readFileSync(filePathsXml, 'utf8');
  let changed = false;
  if (!xml.includes('name="klip_external"')) {
    xml = xml.replace(
      '</paths>',
      '    <external-path name="klip_external" path="." />\n</paths>'
    );
    changed = true;
  }
  if (!xml.includes('name="klip_ext_files"')) {
    xml = xml.replace(
      '</paths>',
      '    <external-files-path name="klip_ext_files" path="." />\n</paths>'
    );
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePathsXml, xml, 'utf8');
    console.log('Updated file_paths.xml for backup sharing');
  }
}

// Install native Android chunked backup writer & Share bridge (KlipAndroidBackup)
const javaPkgDir = path.resolve('android/app/src/main/java/com/kliplokal/app');
if (fs.existsSync(javaPkgDir)) {
  const bridgeJava = `package com.kliplokal.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class KlipBackupBridge {
    private final Activity activity;
    private OutputStream activeStream;
    private Uri activeUri;
    private File activeFile;
    private String activePathLabel;
    private Uri lastSavedUri;
    private String lastSavedPathLabel;

    public KlipBackupBridge(Activity activity) {
        this.activity = activity;
    }

    private String makeResult(boolean ok, String path, String error) {
        JSONObject obj = new JSONObject();
        try {
            obj.put("ok", ok);
            if (path != null) obj.put("path", path);
            if (error != null) obj.put("error", error);
        } catch (Exception ignored) {
        }
        return obj.toString();
    }

    private void closeQuietly() {
        if (activeStream != null) {
            try {
                activeStream.flush();
            } catch (Exception ignored) {
            }
            try {
                activeStream.close();
            } catch (Exception ignored) {
            }
            activeStream = null;
        }
    }

    @JavascriptInterface
    public synchronized String startSave(String requestedFileName) {
        abortSave();

        String safeName = (requestedFileName == null || requestedFileName.trim().isEmpty())
            ? "KlipLokal-Cadangan.klipbackup"
            : requestedFileName.replaceAll("[^a-zA-Z0-9._-]", "_");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/KlipLokal");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                ContentResolver resolver = activity.getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    return makeResult(false, null, "Gagal membuat berkas di folder Download/KlipLokal");
                }
                OutputStream os = resolver.openOutputStream(uri);
                if (os == null) {
                    resolver.delete(uri, null, null);
                    return makeResult(false, null, "Tidak bisa membuka aliran penyimpanan Download");
                }
                activeStream = new BufferedOutputStream(os, 65536);
                activeUri = uri;
                activeFile = null;
                activePathLabel = "Penyimpanan Internal / Download / KlipLokal / " + safeName;
                return makeResult(true, activePathLabel, null);
            } else {
                File outFile;
                String label;
                try {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    File klipDir = new File(downloadsDir, "KlipLokal");
                    if (!klipDir.exists()) klipDir.mkdirs();
                    outFile = new File(klipDir, safeName);
                    activeStream = new BufferedOutputStream(new FileOutputStream(outFile), 65536);
                    label = "Download / KlipLokal / " + safeName;
                } catch (Exception permErr) {
                    File appDownloads = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (appDownloads == null) appDownloads = activity.getFilesDir();
                    if (!appDownloads.exists()) appDownloads.mkdirs();
                    outFile = new File(appDownloads, safeName);
                    activeStream = new BufferedOutputStream(new FileOutputStream(outFile), 65536);
                    label = outFile.getAbsolutePath();
                }
                activeUri = null;
                activeFile = outFile;
                activePathLabel = label;
                return makeResult(true, activePathLabel, null);
            }
        } catch (Exception e) {
            abortSave();
            return makeResult(false, null, e.getMessage() != null ? e.getMessage() : "Gagal menyiapkan penyimpanan");
        }
    }

    @JavascriptInterface
    public synchronized String appendChunkBase64(String base64Chunk) {
        if (activeStream == null) {
            return makeResult(false, null, "Sesi penyimpanan belum dimulai");
        }
        try {
            byte[] decoded = Base64.decode(base64Chunk, Base64.DEFAULT);
            activeStream.write(decoded);
            return makeResult(true, null, null);
        } catch (Exception e) {
            return makeResult(false, null, e.getMessage() != null ? e.getMessage() : "Gagal menulis data cadangan");
        }
    }

    @JavascriptInterface
    public synchronized String finishSave() {
        if (activeStream == null) {
            return makeResult(false, null, "Tidak ada data cadangan yang aktif");
        }
        try {
            closeQuietly();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && activeUri != null) {
                ContentValues doneValues = new ContentValues();
                doneValues.put(MediaStore.Downloads.IS_PENDING, 0);
                activity.getContentResolver().update(activeUri, doneValues, null, null);
                lastSavedUri = activeUri;
            } else if (activeFile != null) {
                MediaScannerConnection.scanFile(
                    activity,
                    new String[] { activeFile.getAbsolutePath() },
                    new String[] { "application/octet-stream" },
                    null
                );
                try {
                    lastSavedUri = FileProvider.getUriForFile(
                        activity,
                        activity.getPackageName() + ".fileprovider",
                        activeFile
                    );
                } catch (Exception ignored) {
                    lastSavedUri = Uri.fromFile(activeFile);
                }
            }

            lastSavedPathLabel = activePathLabel;
            String savedPath = activePathLabel;
            activeUri = null;
            activeFile = null;
            activePathLabel = null;
            return makeResult(true, savedPath, null);
        } catch (Exception e) {
            abortSave();
            return makeResult(false, null, e.getMessage() != null ? e.getMessage() : "Gagal menyelesaikan penyimpanan");
        }
    }

    @JavascriptInterface
    public synchronized void abortSave() {
        closeQuietly();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && activeUri != null) {
            try {
                activity.getContentResolver().delete(activeUri, null, null);
            } catch (Exception ignored) {
            }
        } else if (activeFile != null && activeFile.exists()) {
            try {
                activeFile.delete();
            } catch (Exception ignored) {
            }
        }
        activeUri = null;
        activeFile = null;
        activePathLabel = null;
    }

    @JavascriptInterface
    public synchronized String shareLastSaved() {
        if (lastSavedUri == null) {
            return makeResult(false, null, "Belum ada berkas cadangan yang siap dibagikan");
        }
        final Uri uriToShare = lastSavedUri;
        final String pathToReturn = lastSavedPathLabel;
        activity.runOnUiThread(() -> {
            try {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("application/octet-stream");
                shareIntent.putExtra(Intent.EXTRA_STREAM, uriToShare);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, "Cadangan KlipLokal (.klipbackup)");
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(shareIntent, "Simpan atau Bagikan Cadangan KlipLokal");
                activity.startActivity(chooser);
            } catch (Exception ignored) {
            }
        });
        return makeResult(true, pathToReturn, null);
    }
}
`;

  const mainActivityJava = `package com.kliplokal.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean backupBridgeAttached = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        attachBackupBridge();
    }

    @Override
    public void onStart() {
        super.onStart();
        attachBackupBridge();
    }

    private void attachBackupBridge() {
        if (backupBridgeAttached) return;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(
                new KlipBackupBridge(this),
                "KlipAndroidBackup"
            );
            backupBridgeAttached = true;
        }
    }
}
`;

  fs.writeFileSync(path.join(javaPkgDir, 'KlipBackupBridge.java'), bridgeJava, 'utf8');
  fs.writeFileSync(path.join(javaPkgDir, 'MainActivity.java'), mainActivityJava, 'utf8');
  console.log('Installed native KlipBackupBridge & MainActivity.java for Android APK');
}

// Copy KlipLokal icon into Android mipmap directories if available
const sourceIcon = path.resolve('public/pwa-512x512.png');
const resDir = path.resolve('android/app/src/main/res');

if (fs.existsSync(sourceIcon) && fs.existsSync(resDir)) {
  const mipmapDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
  for (const dir of mipmapDirs) {
    const targetDir = path.join(resDir, dir);
    if (fs.existsSync(targetDir)) {
      fs.copyFileSync(sourceIcon, path.join(targetDir, 'ic_launcher.png'));
      fs.copyFileSync(sourceIcon, path.join(targetDir, 'ic_launcher_round.png'));
      fs.copyFileSync(sourceIcon, path.join(targetDir, 'ic_launcher_foreground.png'));
    }
  }
  console.log('Updated Android launcher icons with KlipLokal icon');
}
