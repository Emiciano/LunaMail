package com.lunamail.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ConnectException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket

class MultiAddressSocketFactoryTest {
    private fun ip(value: String) = InetAddress.getByName(value)

    @Test fun interleavesAddressFamilies() {
        val ordered = MultiAddressSocketFactory.interleave(listOf(ip("::1"), ip("2001:db8::1"), ip("127.0.0.1")))
        assertEquals(listOf(ip("::1"), ip("127.0.0.1"), ip("2001:db8::1")), ordered)
    }

    @Test fun fallsBackToNextAddressWhenFirstRefuses() {
        ServerSocket(0, 1, ip("127.0.0.1")).use { server ->
            // 127.0.0.2 hat keinen Listener und lehnt sofort ab, wie ein IPv6-Eintrag ohne Mailserver.
            val factory = MultiAddressSocketFactory { listOf(ip("127.0.0.2"), ip("127.0.0.1")) }
            factory.createSocket().use { socket ->
                socket.connect(InetSocketAddress.createUnresolved("mail.example", server.localPort), 5_000)
                assertTrue(socket.isConnected)
                assertEquals(ip("127.0.0.1"), socket.inetAddress)
            }
        }
    }

    @Test(expected = ConnectException::class)
    fun failsWhenNoAddressAnswers() {
        val port = ServerSocket(0).use { it.localPort }
        val factory = MultiAddressSocketFactory { listOf(ip("127.0.0.2"), ip("127.0.0.3")) }
        factory.createSocket().use { it.connect(InetSocketAddress.createUnresolved("mail.example", port), 5_000) }
    }
}
