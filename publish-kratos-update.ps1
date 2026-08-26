param (
    [string]$VersionName
)

$ErrorActionPreference = "Stop"

# Set correct JAVA_HOME for Gradle builds
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
Write-Host "Set JAVA_HOME to: $env:JAVA_HOME" -ForegroundColor Cyan

# Define paths
$GradleFile = "apps/zenith-kratos-pilot/app/build.gradle.kts"
$ApkSrcPath = "apps/zenith-kratos-pilot/app/build/outputs/apk/debug/app-debug.apk"
$ApkDestPath = "apk/kratos.apk"
$VersionJsonPath = "apk/kratos-version.json"
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
    # Auto-increment minor version (e.g. 1.0 -> 1.1)
    if ($OldVersionName -match '^(\d+)\.(\d+)$') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2] + 1
        $NewVersionName = "$Major.$Minor"
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
Push-Location "apps/zenith-kratos-pilot"
./gradlew.bat assembleDebug
$GradleExitCode = $LASTEXITCODE
Pop-Location

if ($GradleExitCode -ne 0) {
    Write-Error "Gradle build failed with exit code $GradleExitCode."
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
$HubApkPath = "apps/zenith-hub/public/kratos.apk"
if (Test-Path "apps/zenith-hub/public") {
    try {
        Copy-Item -Path $ApkSrcPath -Destination $HubApkPath -Force
        Write-Host "Copied APK to Hub public assets at $HubApkPath." -ForegroundColor Green
    } catch {
        Write-Warning "Could not copy APK to Hub public assets (file might be locked by a running process): $_"
    }
}

# 4. Update version.json
# SHA-256 of the exact APK being published. The updater refuses any
# manifest without a valid digest and aborts install on mismatch, so a
# tampered or truncated download can never reach the package installer.
$ApkHash = (Get-FileHash -Path $ApkDestPath -Algorithm SHA256).Hash.ToLower()
Write-Host "APK SHA-256: $ApkHash" -ForegroundColor Gray

$VersionJson = @{
    versionCode = $NewVersionCode
    versionName = $NewVersionName
    apkUrl = "https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/kratos.apk"
    sha256 = $ApkHash
} | ConvertTo-Json

Set-Content -Path $VersionJsonPath -Value $VersionJson
Write-Host "Updated kratos-version.json at $VersionJsonPath." -ForegroundColor Green

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
git add $GradleFile $ApkDestPath $VersionJsonPath

Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "Release Kratos v$NewVersionName (versionCode $NewVersionCode)"

Write-Host "Pushing changes to origin main..." -ForegroundColor Yellow
git push origin main

Write-Host "Kratos update v$NewVersionName published successfully!" -ForegroundColor Green
