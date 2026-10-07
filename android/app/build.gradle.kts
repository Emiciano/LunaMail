plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val appVersion: String = providers.fileContents(rootProject.layout.projectDirectory.file("../package.json"))
    .asText
    .map { Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(it)?.groupValues?.get(1) ?: "1.0.0" }
    .getOrElse("1.0.0")

android {
    namespace = "com.lunamail.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lunamail.app"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersion.split(".").map { it.toIntOrNull() ?: 0 }
            .let { (it.getOrElse(0) { 0 } * 10000) + (it.getOrElse(1) { 0 } * 100) + it.getOrElse(2) { 0 } }
            .coerceAtLeast(1)
        versionName = appVersion
    }

    // Fester Signaturschlüssel, damit sich neue APKs über die installierte App installieren
    // lassen und die Accounts erhalten bleiben. Die Schlüsseldatei ist mit dem Passwort aus dem
    // GitHub-Secret ANDROID_SIGNING_PASSWORD verschlüsselt; ohne Passwort wird wie bisher mit
    // dem zufälligen Debug-Schlüssel signiert.
    val signingFile = file("lunamail-signing.p12")
    val signingPassword = providers.environmentVariable("LUNAMAIL_SIGNING_PASSWORD").orNull?.takeIf { it.isNotBlank() }
    if (signingFile.exists() && signingPassword != null) {
        signingConfigs {
            getByName("debug") {
                storeFile = signingFile
                storeType = "pkcs12"
                storePassword = signingPassword
                keyAlias = "lunamail"
                keyPassword = signingPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Gleicher Schlüssel wie bisher, damit sich die schnellere Release-APK über die
            // installierte App installieren lässt.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            // Nur doppelte Lizenzdateien weglassen. mailcap, javamail.* und mimetypes.default
            // braucht JavaMail zur Laufzeit, sonst lassen sich Mailinhalte nicht als Text lesen.
            excludes += setOf(
                "META-INF/LICENSE.md",
                "META-INF/NOTICE.md",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE.txt"
            )
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.05.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.navigation:navigation-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    implementation("com.sun.mail:android-mail:1.6.7")
    implementation("com.sun.mail:android-activation:1.6.7")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    testImplementation("junit:junit:4.13.2")
}
