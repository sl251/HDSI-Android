package io.hdsinterlude.android

import org.junit.Assert.assertEquals
import org.junit.Test

class WakePolicyTest {
    @Test fun continuousAndForegroundHoldWhileIdleBalancedReleases() {
        val policy = WakePolicy()
        assertEquals(90_000L, policy.timeout("continuous", false, 1_000))
        assertEquals(90_000L, policy.timeout("balanced", true, 1_000))
        assertEquals(0L, policy.timeout("balanced", false, 1_000))
    }
    @Test fun activityLeaseExpiresAndCanBeRenewedByAnExplicitAction() {
        val policy = WakePolicy(); policy.activity(1_000)
        assertEquals(90_000L, policy.timeout("balanced", false, 1_000))
        assertEquals(1L, policy.timeout("balanced", false, 600_999))
        assertEquals(0L, policy.timeout("balanced", false, 601_000))
        policy.activity(700_000)
        assertEquals(90_000L, policy.timeout("balanced", false, 700_000))
    }
}
