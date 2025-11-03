# Puppeteer Dependencies Fix for Ubuntu Server

## Problem

Puppeteer's Chrome browser requires system libraries that aren't installed by default on Ubuntu servers. The error indicates missing `libatk-1.0.so.0` and likely other dependencies.

## Solution: Install Required Dependencies

Run these commands on your Ubuntu server:

```bash
# Update package list
sudo apt-get update

# Install all required dependencies for Puppeteer/Chrome
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

## Alternative: Minimal Installation (if full install fails)

If the above doesn't work or you want minimal dependencies, try:

```bash
sudo apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libxshmfence1 \
  libasound2
```

## After Installation

1. **Restart your Node.js application:**
   ```bash
   pm2 restart all
   # or
   systemctl restart your-app-service
   ```

2. **Test the unsubscribe function** - it should now work.

## Verify Installation

You can verify Chrome dependencies are satisfied:

```bash
# Check if Chrome binary exists
ls -la ~/.cache/puppeteer/chrome/

# Try to run Chrome (this will show missing deps if any)
~/.cache/puppeteer/chrome/*/chrome-linux64/chrome --version
```

## Additional Configuration

If you're running in a headless server environment, you might also want to:

```bash
# Install Xvfb (virtual display) if needed
sudo apt-get install -y xvfb

# Or set DISPLAY variable
export DISPLAY=:99
```

However, Puppeteer's `headless: true` mode should work without a display.

## Alternative Approach: Use puppeteer-core

If installing all dependencies is problematic, you can use `puppeteer-core` with a system Chrome:

1. Install Chrome manually:
   ```bash
   wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
   sudo apt-get install -y ./google-chrome-stable_current_amd64.deb
   ```

2. Update your code to use `puppeteer-core` and point to system Chrome:
   ```typescript
   import puppeteer from 'puppeteer-core';
   
   const browser = await puppeteer.launch({
     headless: true,
     executablePath: '/usr/bin/google-chrome-stable',
   });
   ```

## Troubleshooting

If you still get errors after installation:

1. **Check which library is missing:**
   ```bash
   ldd ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome | grep "not found"
   ```

2. **Install missing libraries individually:**
   ```bash
   sudo apt-get install -y <missing-library-name>
   ```

3. **Clear Puppeteer cache and reinstall:**
   ```bash
   rm -rf ~/.cache/puppeteer
   npm install puppeteer
   ```

## Quick One-Liner

Copy and paste this entire command:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils && pm2 restart all
```

This will install everything and restart your app automatically.

