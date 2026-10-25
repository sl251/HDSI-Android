package io.hdsinterlude.android

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import java.util.zip.ZipInputStream

class StoryArchiveTest {
    private val id = "a".repeat(64)
    private fun setup(root: File): File {
        File(root, "cards").mkdirs()
        File(root, "cards/$id.json").writeText(JSONObject().put("id", id).put("card", JSONObject().put("name", "测试角色")).toString())
        File(root, "cards/$id.source").writeText("original card")
        val profile = File(root, "profiles/$id").apply { mkdirs() }
        File(profile, "hds.sqlite").writeBytes("SQLite format 3\u0000fixture".toByteArray())
        File(profile, "qq-policy.json").writeText("{\"enabled\":false}")
        File(profile, "images").mkdirs(); File(profile, "images/example.jpg").writeBytes(byteArrayOf(1, 2, 3))
        return profile
    }
    @Test fun archiveRoundTripPreservesImagesAndChecksums() {
        val root = Files.createTempDirectory("hds-archive").toFile()
        try {
            setup(root); val archive = StoryArchive(root); val output = ByteArrayOutputStream(); archive.export(id, output)
            val stage = archive.stage(id, ByteArrayInputStream(output.toByteArray()))
            val manifest = JSONObject(File(stage, "manifest.json").readText())
            assertEquals(2, manifest.getInt("format")); assertEquals(1, manifest.getInt("dataSchema"))
            assertEquals(BuildConfig.VERSION_NAME, manifest.getString("app")); assertEquals(BuildConfig.HDS_VERSION, manifest.getString("hds"))
            assertArrayEquals(byteArrayOf(1, 2, 3), File(stage, "profile/images/example.jpg").readBytes())
            assertThrows(IllegalArgumentException::class.java) { archive.stage("b".repeat(64), ByteArrayInputStream(output.toByteArray())) }
        } finally { root.deleteRecursively() }
    }
    private fun rewriteManifest(bytes: ByteArray, change: (JSONObject) -> Unit): ByteArray {
        val output = ByteArrayOutputStream()
        ZipInputStream(ByteArrayInputStream(bytes)).use { input -> ZipOutputStream(output).use { zip ->
            while (true) {
                val entry = input.nextEntry ?: break; var content = input.readBytes()
                if (entry.name == "manifest.json") { val manifest = JSONObject(String(content, Charsets.UTF_8)); change(manifest); content = manifest.toString().toByteArray() }
                zip.putNextEntry(ZipEntry(entry.name)); zip.write(content); zip.closeEntry()
            }
        } }
        return output.toByteArray()
    }
    @Test fun legacyArchivesRemainReadableAndUnknownSchemasAreRejected() {
        val root = Files.createTempDirectory("hds-archive-version").toFile()
        try {
            setup(root); val archive = StoryArchive(root); val output = ByteArrayOutputStream(); archive.export(id, output)
            val legacy = rewriteManifest(output.toByteArray()) { it.put("format", 1).put("hds", "1.0.1-rc51").put("app", "0.1.0-preview.7.1").remove("dataSchema") }
            assertTrue(File(archive.stage(id, ByteArrayInputStream(legacy)), "profile/hds.sqlite").isFile)
            for (change in listOf<(JSONObject) -> Unit>({ it.put("dataSchema", 99) }, { it.put("hds", "future-engine") }, { it.put("format", 99) })) {
                assertThrows(IllegalArgumentException::class.java) { archive.stage(id, ByteArrayInputStream(rewriteManifest(output.toByteArray(), change))) }
            }
        } finally { root.deleteRecursively() }
    }
    @Test fun exportPreflightUsesImportLimitsAndNeverOpensRejectedDestination() {
        val root = Files.createTempDirectory("hds-archive-limits").toFile()
        try {
            setup(root); val output = ByteArrayOutputStream(); StoryArchive(root).export(id, output)
            for (limits in listOf(StoryArchive.Limits(fileBytes = 64), StoryArchive.Limits(totalBytes = 128), StoryArchive.Limits(entries = 5), StoryArchive.Limits(manifestBytes = 32))) {
                val archive = StoryArchive(root, limits); var opened = false
                assertThrows(IllegalArgumentException::class.java) { archive.exportTo(id) { opened = true; ByteArrayOutputStream() } }
                assertFalse("Rejected archive must not truncate destination", opened)
                assertThrows(IllegalArgumentException::class.java) { archive.stage(id, ByteArrayInputStream(output.toByteArray())) }
            }
            val limits = StoryArchive.Limits(fileBytes = 4096, totalBytes = 8192, entries = 6, manifestBytes = 4096)
            val bounded = StoryArchive(root, limits); val valid = ByteArrayOutputStream(); bounded.export(id, valid)
            assertTrue(File(bounded.stage(id, ByteArrayInputStream(valid.toByteArray())), "profile/hds.sqlite").isFile)
        } finally { root.deleteRecursively() }
    }
    @Test fun resetAndCrashRecoveryRestoreOriginalProfile() {
        val root = Files.createTempDirectory("hds-reset").toFile()
        try {
            val profile = setup(root); val archive = StoryArchive(root); archive.replace(id)
            assertFalse(File(profile, "hds.sqlite").exists()); assertTrue(File(profile, "qq-policy.json").exists())
            StoryArchive(root).recover()
            assertTrue(File(profile, "hds.sqlite").exists()); assertTrue(File(profile, "images/example.jpg").exists())
            assertFalse(File(root, "story-operation.json").exists())
        } finally { root.deleteRecursively() }
    }
    @Test fun committedResetRetainsBackupAndOtherProfiles() {
        val root = Files.createTempDirectory("hds-reset-commit").toFile()
        try {
            val profile = setup(root); val other = File(root, "profiles/${"b".repeat(64)}").apply { mkdirs() }; File(other, "keep").writeText("other story")
            val archive = StoryArchive(root); val backup = archive.replace(id); archive.commit(); archive.recover()
            assertFalse(File(profile, "hds.sqlite").exists()); assertTrue(File(root, "story-backups/$id/$backup/profile/hds.sqlite").exists()); assertEquals("other story", File(other, "keep").readText())
        } finally { root.deleteRecursively() }
    }
    @Test fun interruptedCardRecoveryIsRepeatableAndLocalBackupCanBeRestored() {
        val root = Files.createTempDirectory("hds-card-recovery").toFile()
        try {
            val profile = setup(root); val archive = StoryArchive(root); val backup = archive.replace(id)
            val rejected = File(root, "partial-new-profile"); assertTrue(profile.renameTo(rejected))
            assertTrue(File(root, "story-backups/$id/$backup/profile").renameTo(profile))
            File(root, "cards/$id.json").writeText("incomplete")
            archive.recover()
            assertEquals("测试角色", JSONObject(File(root, "cards/$id.json").readText()).getJSONObject("card").getString("name"))
            archive.replace(id); archive.commit()
            val stage = archive.stagePrevious(id); archive.replace(id, stage); archive.commit()
            assertTrue(File(profile, "hds.sqlite").exists())
        } finally { root.deleteRecursively() }
    }
    @Test fun traversalAndDuplicateEntriesAreRejected() {
        val root = Files.createTempDirectory("hds-bad-archive").toFile()
        try {
            setup(root)
            for (path in listOf("profile/../../outside", "profile/evil\\path", "unlisted.txt")) {
                val output = ByteArrayOutputStream(); ZipOutputStream(output).use { it.putNextEntry(ZipEntry(path)); it.write(byteArrayOf(1)); it.closeEntry() }
                assertThrows(IllegalArgumentException::class.java) { StoryArchive(root).stage(id, ByteArrayInputStream(output.toByteArray())) }
            }
            assertFalse(File(root.parentFile, "outside").exists())
        } finally { root.deleteRecursively() }
    }
    @Test fun restoreRepairsMissingOriginalSourceAndRollbackRestoresItsPreviousState() {
        val root = Files.createTempDirectory("hds-source-recovery").toFile()
        try {
            setup(root); val archive = StoryArchive(root); val output = ByteArrayOutputStream(); archive.export(id, output)
            val source = File(root, "cards/$id.source")
            assertTrue(source.delete())
            var stage = archive.stage(id, ByteArrayInputStream(output.toByteArray()))
            archive.replace(id, stage)
            assertEquals("original card", source.readText())
            archive.recover()
            assertFalse("Rollback must preserve the originally missing source", source.exists())
            stage = archive.stage(id, ByteArrayInputStream(output.toByteArray()))
            archive.replace(id, stage); archive.commit()
            assertEquals("original card", source.readText())
            val reexport = ByteArrayOutputStream(); archive.export(id, reexport)
            assertEquals("original card", File(archive.stage(id, ByteArrayInputStream(reexport.toByteArray())), "card.source").readText())
        } finally { root.deleteRecursively() }
    }
    @Test fun localBackupIncludesOriginalSourceAndInterruptedRestoreCanBeRolledBackTwice() {
        val root = Files.createTempDirectory("hds-source-backup").toFile()
        try {
            setup(root); val archive = StoryArchive(root); archive.replace(id); archive.commit()
            val stage = archive.stagePrevious(id)
            assertEquals("original card", File(stage, "card.source").readText())
            val source = File(root, "cards/$id.source"); source.writeText("before restore")
            archive.replace(id, stage)
            assertEquals("original card", source.readText())
            val journal = File(root, "story-operation.json").readText()
            archive.recover()
            assertEquals("before restore", source.readText())
            File(root, "story-operation.json").writeText(journal)
            source.writeText("partial write")
            archive.recover()
            assertEquals("before restore", source.readText())
        } finally { root.deleteRecursively() }
    }
    @Test fun legacyLocalBackupWithoutSourceKeepsTheExistingOriginal() {
        val root = Files.createTempDirectory("hds-legacy-source").toFile()
        try {
            setup(root); val archive = StoryArchive(root); val backup = archive.replace(id); archive.commit()
            File(root, "story-backups/$id/$backup/card.source").delete()
            val stage = archive.stagePrevious(id); archive.replace(id, stage); archive.commit()
            assertEquals("original card", File(root, "cards/$id.source").readText())
        } finally { root.deleteRecursively() }
    }
}
