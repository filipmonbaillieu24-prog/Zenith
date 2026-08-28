plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.zenith.pulse"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.zenith.pulse"
        minSdk = 26
        targetSdk = 36
        versionCode = 39
        versionName = "1.0.38"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      buildConfig = true
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)

  // Core Android
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.work.runtime.ktx)
  // Keystore-backed SharedPreferences for the session token.
  implementation(libs.androidx.security.crypto)

  // Arch & Compose
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  debugImplementation(libs.androidx.compose.ui.tooling)

  // Health Connect
  implementation(libs.health.connect.client)

  // Networking & Serialization
  implementation(libs.ktor.client.okhttp)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.supabase.postgrest)

  // The BLE scale decoders are pure functions over a byte array, so they are unit
  // testable without a device or an emulator - and worth testing, because a decoding
  // error there does not crash, it writes a plausible but wrong weight into history.
  testImplementation(libs.junit)
}
