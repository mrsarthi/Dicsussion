const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Building Android Web Assets...');

try {
    // 1. Build the Vite project
    execSync('npm run build', { stdio: 'inherit' });

    console.log('\n📦 Syncing Web Assets to Android Studio Project...');
    execSync('npm run cap:sync', { stdio: 'inherit' });

    console.log(`\n✅ Success! Your Web Assets are synced to the Android project.`);
    console.log(`\nWhat next?`);
    console.log(`1. Open Android Studio`);
    console.log(`2. Build your Signed 'app-release.apk' or 'app-debug.apk'`);
    console.log(`3. Upload the APK file to your 'vLatest' / 'Production' GitHub Release!`);

} catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
}
