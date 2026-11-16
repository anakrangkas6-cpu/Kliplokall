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
