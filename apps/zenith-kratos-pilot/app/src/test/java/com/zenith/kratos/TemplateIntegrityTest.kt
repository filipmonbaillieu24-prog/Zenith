package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A template is what the athlete intends to do. A log is what happened. The second must
 * never overwrite the first.
 *
 * This has gone wrong twice. First the write-back copied performed reps and reserve
 * straight into the routine, which turned a hand-set RIR 2 into RIR 4 and left ten rep
 * ranges carrying the marks of it - a "9-11" whose sibling sets both say 11-13, matching
 * a session where nine reps were managed. Then, one layer in, the tracker overwrote a
 * set's asked-for target with what was performed before the between-set adjustment had
 * read it, so a set that fell apart was indistinguishable from one that went to plan.
 */
class TemplateIntegrityTest {

    @Test
    fun `an existing prescription is returned untouched`() {
        val existing = TemplateSet(type = "working", minReps = 11, maxReps = 13, targetRir = 2)
        assertEquals(existing, templateSetFor(existing, "working"))
    }

    @Test
    fun `a set with nothing to inherit gets a stated default, never a measurement`() {
        val made = templateSetFor(null, "working")
        assertEquals(DEFAULT_WORKING_SET, made)
        // The signature is the guarantee: no performed set can reach this function.
        assertEquals(8, made.minReps)
        assertEquals(12, made.maxReps)
        assertEquals(2, made.targetRir)
    }

    @Test
    fun `a warmup default is a warmup, not a working set`() {
        assertEquals(DEFAULT_WARMUP_SET, templateSetFor(null, "warmup"))
    }

    @Test
    fun `the type follows the position even when the range is inherited`() {
        // A working set inheriting from a warmup keeps working-set identity.
        val warmup = TemplateSet(type = "warmup", minReps = 6, maxReps = 8, targetRir = 4)
        assertEquals("working", templateSetFor(warmup, "working").type)
    }

    @Test
    fun `no rep range is ever derived from a performed set`() {
        // Greppy on purpose. The shape that caused it was
        //   minReps = existing?.minReps ?: s.reps
        // and it survived one round of being fixed by comment alone.
        val root = File("src/main/java/com/zenith/kratos")
        val offenders = mutableListOf<String>()
        val pattern = Regex("""(minReps|maxReps|targetRir)\s*=\s*[^\n]*\b(s|ls)\.(reps|rir)\b""")
        root.walkTopDown().filter { it.extension == "kt" }.forEach { f ->
            f.readLines().forEachIndexed { i, line ->
                if (line.trimStart().startsWith("//")) return@forEachIndexed
                if (pattern.containsMatchIn(line)) offenders += "${f.name}:${i + 1}: ${line.trim()}"
            }
        }
        assertTrue("performed reps are reaching a template range:\n${offenders.joinToString("\n")}", offenders.isEmpty())
    }

    @Test
    fun `routines are pulled again when the screen comes back to the foreground`() {
        // Templates were fetched once at start-up, and the only button that pulls them
        // sits inside the empty state - so an athlete who already had routines could not
        // get a web edit onto the phone without killing the process.
        val src = File("src/main/java/com/zenith/kratos/ui/screens/TodayScreen.kt").readText()
        assertTrue("no lifecycle refresh", src.contains("Lifecycle.Event.ON_RESUME"))
        assertTrue("resume does not refresh routines", src.contains("refreshRoutines(false)"))
    }

    @Test
    fun `a manual refresh exists outside the empty state`() {
        val src = File("src/main/java/com/zenith/kratos/ui/screens/TodayScreen.kt").readText()
        val manual = src.indexOf("refreshRoutines(true)")
        val emptyState = src.indexOf("if (templates.isEmpty())")
        assertTrue("no manual refresh at all", manual >= 0)
        assertTrue(
            "the only manual refresh is inside the empty state, where it is useless",
            manual > src.indexOf("ROUTINES") || emptyState < 0
        )
    }

    @Test
    fun `the tracker reads a set's target before overwriting it`() {
        // askedReps and askedRir must be captured above the assignments that replace
        // targetReps and targetRir with what was performed.
        val src = File("src/main/java/com/zenith/kratos/ui/screens/TrackerScreen.kt").readText()
        val captured = src.indexOf("val askedReps = setVal.targetReps")
        val overwritten = src.indexOf("setVal.targetReps = r")
        assertTrue("askedReps is not captured at all", captured >= 0)
        assertTrue("the target is overwritten before it is read", captured < overwritten)
        assertTrue(
            "the adjustment is reading the overwritten target again",
            !src.contains("prevTargetReps = setVal.targetReps")
        )
    }
}
