param (
    [string]$VersionName
)

$ErrorActionPreference = "Stop"

# Set correct JAVA_HOME for Gradle builds
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot', 'Process')
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
Write-Host "Set JAVA_HOME to: $env:JAVA_HOME" -ForegroundColor Cyan

# Define paths
$GradleFile = "apps/zenith-pulse/app/build.gradle.kts"
$ApkSrcPath = "apps/zenith-pulse/app/build/outputs/apk/debug/app-debug.apk"
$ApkDestPath = "apk/pulse-debug.apk"
$VersionJsonPath = "apk/pulse-version.json"
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
# Check $LASTEXITCODE rather than try/catch: Gradle writes warnings to stderr,
# and in Windows PowerShell a native command's stderr surfaces as ErrorRecords,
# so the catch fired on successful builds that merely emitted a deprecation
# warning - failing the publish for no reason.
Push-Location "apps/zenith-pulse"
./gradlew.bat assembleDebug
$GradleExitCode = $LASTEXITCODE
Pop-Location

if ($GradleExitCode -ne 0) {
    Write-Error "Gradle build failed with exit code $GradleExitCode."
}

# 3. Copy APK to destination folder if built
if (Test-Path $ApkSrcPath) {
    if (-not (Test-Path "apk")) {
        New-Item -ItemType Directory -Path "apk" | Out-Null
    }
    Copy-Item -Path $ApkSrcPath -Destination $ApkDestPath -Force
    Write-Host "Copied APK to $ApkDestPath." -ForegroundColor Green

    # SHA-256 of the exact APK being published. The updater refuses any manifest
    # without a valid digest and aborts install on mismatch, so a tampered or
    # truncated download can never reach the package installer.
    $ApkHash = (Get-FileHash -Path $ApkDestPath -Algorithm SHA256).Hash.ToLower()
    Write-Host "APK SHA-256: $ApkHash" -ForegroundColor Gray

    # Update pulse-version.json
    $VersionJson = @{
        versionCode = $NewVersionCode
        versionName = $NewVersionName
        apkUrl = "https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/pulse-debug.apk"
        sha256 = $ApkHash
    } | ConvertTo-Json

    Set-Content -Path $VersionJsonPath -Value $VersionJson
    Write-Host "Updated $VersionJsonPath." -ForegroundColor Green
}

Write-Host "Zenith Pulse script completed." -ForegroundColor Green
