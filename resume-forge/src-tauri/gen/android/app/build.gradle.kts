import java.util.Properties
import java.nio.file.Files

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// Windows-specific build fixes:
// 1. Tauri creates symlinks in jniLibs that Gradle can't follow on Windows without
//    SeCreateSymbolicLinkPrivilege — resolve them to real copies before the merge.
// 2. Gradle's mergeNativeLibs fails with AccessDeniedException on its own output dir
//    (arm64-v8a etc.) when a previous build left stale handles — pre-delete it.
// 3. packageRelease can't delete its incremental/tmp dir for the same reason — pre-delete it.
gradle.taskGraph.whenReady {
    allTasks.filter { it.name.startsWith("merge") && it.name.endsWith("NativeLibs") }.forEach { task ->
        task.doFirst {
            // Resolve jniLibs symlinks → real files
            val jniLibsDir = file("src/main/jniLibs")
            if (jniLibsDir.exists()) {
                jniLibsDir.walkTopDown()
                    .filter { it.isFile && it.extension == "so" }
                    .forEach { soFile ->
                        val path = soFile.toPath()
                        if (Files.isSymbolicLink(path)) {
                            val linkTarget = Files.readSymbolicLink(path)
                            val realTarget = if (linkTarget.isAbsolute) linkTarget.toFile()
                                            else soFile.parentFile.resolve(linkTarget.toFile())
                            if (realTarget.exists()) {
                                Files.delete(path)
                                realTarget.copyTo(soFile)
                            }
                        }
                    }
            }
            // Pre-delete the merge output dir so Gradle can recreate it without hitting
            // AccessDeniedException on Windows (stale handle from a previous build).
            // Use cmd.exe rmdir to avoid silent failure from Kotlin's deleteRecursively().
            val mergeOut = file("build/intermediates/merged_native_libs")
            if (mergeOut.exists()) {
                if (System.getProperty("os.name").lowercase().contains("win")) {
                    ProcessBuilder("cmd.exe", "/c", "rmdir", "/s", "/q", mergeOut.absolutePath)
                        .redirectErrorStream(true)
                        .start()
                        .waitFor()
                } else {
                    mergeOut.deleteRecursively()
                }
            }
        }
    }

    // Windows holds open handles on the incremental/package tmp dirs between builds.
    // Kotlin's deleteRecursively() silently fails when Defender scans zip-cache files;
    // use cmd.exe rmdir /s /q which forces handle release on Windows.
    allTasks.filter { it.name.startsWith("package") && it.name.endsWith("Release") }.forEach { task ->
        task.doFirst {
            val tmpDir = file("build/intermediates/incremental/${task.name}/tmp")
            if (tmpDir.exists()) {
                if (System.getProperty("os.name").lowercase().contains("win")) {
                    ProcessBuilder("cmd.exe", "/c", "rmdir", "/s", "/q", tmpDir.absolutePath)
                        .redirectErrorStream(true)
                        .start()
                        .waitFor()
                } else {
                    tmpDir.deleteRecursively()
                }
            }
        }
    }
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.jules.resume_forge"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.jules.resume_forge"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    val keystorePropertiesFile = rootProject.file("key.properties")
    val keystoreProperties = Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(keystorePropertiesFile.inputStream())
    }
    val releaseStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        ?: keystoreProperties.getProperty("storePassword")
    val releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
        ?: keystoreProperties.getProperty("keyAlias")
    val releaseKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        ?: keystoreProperties.getProperty("keyPassword")
    val hasReleaseSigningConfig = releaseStorePassword != null
        && releaseKeyAlias != null
        && releaseKeyPassword != null

    signingConfigs {
        if (hasReleaseSigningConfig) {
            create("release") {
                val envStoreFile = System.getenv("ANDROID_KEYSTORE_PATH")
                val propStoreFile = keystoreProperties.getProperty("storeFile")
                storeFile = when {
                    envStoreFile != null -> file(envStoreFile)
                    propStoreFile != null -> file(propStoreFile)
                    else -> file("resumeforge.keystore")
                }
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = if (hasReleaseSigningConfig) {
                signingConfigs.getByName("release")
            } else {
                logger.warn(
                    "No release keystore configured (key.properties or ANDROID_KEYSTORE_* env vars); " +
                    "falling back to debug signing. Do NOT distribute this APK."
                )
                signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")