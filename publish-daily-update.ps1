param (
    [string]$VersionName
)

$ErrorActionPreference = "Stop"

# Set correct JAVA_HOME for Gradle builds
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
Write-Host "Set JAVA_HOME to: $env:JAVA_HOME" -ForegroundColor Cyan

# Define paths
$GradleFile = "apps/zenith-daily-pilot/app/build.gradle.kts"
$ApkSrcPath = "apps/zenith-daily-pilot/app/build/outputs/apk/debug/app-debug.apk"
$ApkDestPath = "apk/daily-debug.apk"
$VersionJsonPath = "apk/daily-version.json"
$AdbPath = "C:\Users\filip\AppData\Local\Android\Sdk\platform-tools\adb.exe"

# 1. Read build.gradle.kts and parse version code and name
if (-not (Test-Path $GradleFile)) {
    Write-Error "Could not find build.gradle.kts at $GradleFile"
}

Write-Host "Reading current version details from $GradleFile..." -ForegroundColor Yellow
$GradleContent = Get-Content $GradleFile -Raw

$VersionCodeRegex = 'versionCode\s*=\s*(\d+)'
$VersionNameRegex = 'versionName\s*=\s*"([^"]+)"'

if ($GradleContent -match $VersionCodeRegex) {
    $OldVersionCode = [int]$Matches[1]
} else {
    Write-Error "Could not parse versionCode from build.gradle.kts"
}

if ($GradleContent -match $VersionNameRegex) {
    $OldVersionName = $Matches[1]
} else {
    Write-Error "Could not parse versionName from build.gradle.kts"
}

# Increment version details
$NewVersionCode = $OldVersionCode + 1

if ($VersionName) {
    $NewVersionName = $VersionName
} else {
    if ($OldVersionName -match '^(\d+)\.(\d+)\.(\d+)$') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2]
        $Patch = [int]$Matches[3] + 1
        $NewVersionName = "$Major.$Minor.$Patch"
    } else {
        $NewVersionName = "$OldVersionName.1"
    }
}

Write-Host "Current Version: $OldVersionName (Code: $OldVersionCode)" -ForegroundColor Gray
Write-Host "New Version:     $NewVersionName (Code: $NewVersionCode)" -ForegroundColor Green

# Update build.gradle.kts
$UpdatedContent = $GradleContent -replace $VersionCodeRegex, "versionCode = $NewVersionCode"
$UpdatedContent = $UpdatedContent -replace $VersionNameRegex, "versionName = `"$NewVersionName`""
Set-Content -Path $GradleFile -Value $UpdatedContent -NoNewline
Write-Host "Updated $GradleFile with new version numbers." -ForegroundColor Green

# 2. Compile APK using gradle
Write-Host "Starting Gradle build (assembleDebug)..." -ForegroundColor Yellow
Push-Location "apps/zenith-daily-pilot"
try {
    ./gradlew.bat assembleDebug --rerun-tasks
} catch {
    Write-Error "Gradle build failed."
} finally {
    Pop-Location
}

# Check if APK was built
if (-not (Test-Path $ApkSrcPath)) {
    Write-Error "APK was not built successfully. File not found at $ApkSrcPath"
}
Write-Host "APK built successfully!" -ForegroundColor Green

# 3. Copy APK to destination folder
if (-not (Test-Path "apk")) {
    New-Item -ItemType Directory -Path "apk" | Out-Null
}
Copy-Item -Path $ApkSrcPath -Destination $ApkDestPath -Force
Write-Host "Copied APK to $ApkDestPath." -ForegroundColor Green

# Copy to Zenith Hub public folder for local developer QR-code sync
$HubApkPath = "apps/zenith-hub/public/daily-debug.apk"
if (Test-Path "apps/zenith-hub/public") {
    Copy-Item -Path $ApkSrcPath -Destination $HubApkPath -Force
    Write-Host "Copied APK to Hub public assets at $HubApkPath." -ForegroundColor Green
}

# 4. Update daily-version.json
$VersionJson = @{
    versionCode = $NewVersionCode
    versionName = $NewVersionName
    apkUrl = "https://github.com/filipmonbaillieu24-prog/Zenith/releases/download/v0.1.0/daily-debug.apk"
} | ConvertTo-Json

Set-Content -Path $VersionJsonPath -Value $VersionJson
Write-Host "Updated daily-version.json at $VersionJsonPath." -ForegroundColor Green

# 5. Check and install on connected Android devices via ADB
if (Test-Path $AdbPath) {
    Write-Host "Checking for connected Android devices via ADB..." -ForegroundColor Yellow
    $Devices = & $AdbPath devices
    $DeviceLines = $Devices | Where-Object { $_ -match '\tdevice$' }
    
    if ($DeviceLines) {
        Write-Host "Found connected device(s). Installing updated APK..." -ForegroundColor Yellow
        foreach ($DeviceLine in $DeviceLines) {
            $DeviceId = ($DeviceLine -split '\t')[0]
            Write-Host "Installing on $DeviceId..." -ForegroundColor Cyan
            & $AdbPath -s $DeviceId install -r $ApkDestPath
        }
        Write-Host "Installation completed on all connected devices." -ForegroundColor Green
    } else {
        Write-Host "No connected Android devices found via ADB. Skipping local installation." -ForegroundColor Gray
    }
} else {
    Write-Host "ADB not found at $AdbPath. Skipping local installation." -ForegroundColor Gray
}

# 6. Commit changes to Git and push to main branch
Write-Host "Staging files in Git..." -ForegroundColor Yellow
git add $GradleFile $ApkDestPath $VersionJsonPath apps/zenith-hub/public/daily-debug.apk apps/zenith-hub/src/pages/hub/PilotPanel.tsx

Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "Release Zenith Daily v$NewVersionName (versionCode $NewVersionCode)"

Write-Host "Pushing changes to origin main..." -ForegroundColor Yellow
git push origin main

Write-Host "Zenith Daily update v$NewVersionName published successfully!" -ForegroundColor Green
