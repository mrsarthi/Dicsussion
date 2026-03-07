const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Building Android Web Assets...');

try {
    // 1. Build the Vite project
    execSync('npm run build', { stdio: 'inherit' });

    console.log('\n📦 Packaging dist.zip for OTA updates...');

    const distPath = path.join(__dirname, 'dist');
    const releasePath = path.join(__dirname, 'release', 'android');
    const zipPath = path.join(releasePath, 'dist.zip');

    // Ensure release folder exists
    if (!fs.existsSync(releasePath)) {
        fs.mkdirSync(releasePath, { recursive: true });
    }

    // Since Windows doesn't always have 'zip' universally available, and JS zip libraries 
    // aren't guaranteed to be installed, we use a neat PowerShell trick.
    const psCommand = `Compress-Archive -Path "${distPath}\\*" -DestinationPath "${zipPath}" -Force`;

    console.log(`Running: ${psCommand}`);
    execSync(`powershell.exe -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

    console.log(`\n✅ Success! Your OTA update bundle is ready.`);
    console.log(`📂 Location: ${zipPath}`);
    console.log(`\nWhat next?`);
    console.log(`Upload BOTH your 'app-debug.apk' and this 'dist.zip' file to your GitHub Release!`);

} catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
}
