plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appVersion = (findProperty("appVersion") as String?) ?: "0.1.0"
val appVersionCode = (findProperty("appVersionCode") as String?)?.toInt() ?: 1

// Release signing comes from the environment (CI secrets, or scripts/build-release.sh locally).
val releaseKeystore: String? = System.getenv("LTTV_KEYSTORE")

android {
    namespace = "io.github.lwagf.lttv"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.lwagf.lttv"
        minSdk = 28
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersion
        manifestPlaceholders["appLabel"] = "LTTV"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("LTTV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("LTTV_KEY_ALIAS") ?: "lttv"
                keyPassword = System.getenv("LTTV_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            // Installs alongside the release build instead of clashing with its signature.
            applicationIdSuffix = ".debug"
            manifestPlaceholders["appLabel"] = "LTTV dev"
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
