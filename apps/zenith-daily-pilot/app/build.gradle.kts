plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.kapt")
}

android {
    namespace = "com.zenith.daily"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.zenith.daily"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
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
      aidl = false
      buildConfig = false
      shaders = false
    }

    androidResources {
        noCompress += "tflite"
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
        pickFirsts += "assets/**"
        pickFirsts += "**/*.tflite"
      }
    }
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  debugImplementation(libs.androidx.compose.ui.tooling)

  // Local tests & Instrumented tests
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Supabase & Ktor
  implementation(libs.supabase.postgrest)
  implementation(libs.supabase.auth)
  implementation(libs.ktor.client.okhttp)
  implementation(libs.kotlinx.serialization.json)

  // Room Database
  implementation(libs.room.runtime)
  implementation(libs.room.ktx)
  add("kapt", libs.room.compiler)

  // Health Connect
  implementation(libs.health.connect.client)

  // CameraX & ML Kit
  implementation(libs.camera.camera2)
  implementation(libs.camera.lifecycle)
  implementation(libs.camera.view)
  implementation(libs.mlkit.barcode.scanning)
}
