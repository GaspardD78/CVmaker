import java.util.Properties
import java.nio.file.Files

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// Windows: Tauri creates symlinks in jniLibs; Gradle's mergeNativeLibs fails on Windows
// with AccessDeniedException when symlinks lack SeCreateSymbolicLinkPrivilege.
// Resolve symlinks to real copies before any merge task runs.
// Also pre-delete the packageRelease tmp dir so Windows doesn't block Gradle from clearing it.
gradle.taskGraph.whenReady {
    allTasks.filter { it.name.startsWith("merge") && it.name.endsWith("NativeLibs") }.forEach { task ->
        task.doFirst {
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
        }
    }

    // Windows holds open handles on the incremental/package tmp dirs between builds.
    // Force-delete them before any package task so Gradle's own delete doesn't fail.
    allTasks.filter { it.name.startsWith("package") && it.name.endsWith("Release") }.forEach { task ->
        task.doFirst {
            val tmpDir = file("build/intermediates/incremental/${task.name}/tmp")
            if (tmpDir.exists()) {
                tmpDir.deleteRecursively()
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
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("key.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(keystorePropertiesFile.inputStream())
            }

            val envStoreFile = System.getenv("ANDROID_KEYSTORE_PATH")
            val propStoreFile = keystoreProperties.getProperty("storeFile")
            storeFile = when {
                envStoreFile != null -> file(envStoreFile)
                propStoreFile != null -> file(propStoreFile)
                else -> file("resumeforge.keystore")
            }

            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                ?: keystoreProperties.getProperty("storePassword")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                ?: keystoreProperties.getProperty("keyAlias")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                ?: keystoreProperties.getProperty("keyPassword")
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
            signingConfig = signingConfigs.getByName("release")
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