const fs = require('fs');
const path = require('path');

const copyDir = (srcRel, destRel) => {
  const src = path.resolve(__dirname, srcRel);
  const dest = path.resolve(__dirname, destRel);
  try {
    // Ensure destination directory is clean
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`Successfully copied ${src} to ${dest}`);
  } catch (err) {
    console.error(`Error copying ${src} to ${dest}:`, err);
    process.exit(1);
  }
};

copyDir('apps/zenith-aero/dist', 'apps/zenith-hub/dist/aero');
copyDir('apps/zenith-vigor/dist', 'apps/zenith-hub/dist/vigor');
copyDir('apps/zenith-kratos/dist', 'apps/zenith-hub/dist/kratos');
copyDir('apps/zenith-fuel/dist', 'apps/zenith-hub/dist/fuel');
copyDir('apps/zenith-stride/dist', 'apps/zenith-hub/dist/stride');
