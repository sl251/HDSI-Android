package io.hdsinterlude.android

import org.junit.Assert.*
import org.junit.Test

class FreeImageBrowserTest {
    @Test fun pageOriginIsRestrictedToTheFreeGenerator() {
        assertTrue(isFreeImagePage("https://imagefree.net/"))
        assertTrue(isFreeImagePage("https://imagefree.net/?prompt=test"))
        for (address in listOf(null, "http://imagefree.net", "https://imagefree.net.evil.test", "https://user@imagefree.net", "https://imagefree.net:444/", "javascript:alert(1)", "file:///data/user/0/")) assertFalse(address, isFreeImagePage(address))
    }
}
