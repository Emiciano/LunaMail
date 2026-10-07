package com.lunamail.app.data

import java.io.IOException
import java.net.ConnectException
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketAddress
import java.net.UnknownHostException
import javax.net.SocketFactory

/**
 * JavaMail verbindet sich nur mit der ersten Adresse eines Hosts. Hat ein Mailserver
 * einen IPv6-Eintrag, lauscht dort aber nicht (oder das Mobilnetz routet IPv6 schlecht),
 * schlägt jede Verbindung fehl, obwohl IPv4 funktionieren würde. Diese Factory probiert
 * alle Adressen abwechselnd nach Adressfamilie durch, wie es Apple Mail und Thunderbird tun.
 * TLS und die Zertifikatsprüfung legt JavaMail anschließend mit dem Hostnamen darüber.
 */
class MultiAddressSocketFactory(
    private val resolve: (String) -> List<InetAddress> = { InetAddress.getAllByName(it).toList() },
) : SocketFactory() {
    override fun createSocket(): Socket = MultiAddressSocket(resolve)

    override fun createSocket(host: String, port: Int): Socket =
        createSocket().apply { connect(InetSocketAddress.createUnresolved(host, port), DEFAULT_TIMEOUT_MS) }

    override fun createSocket(host: String, port: Int, localHost: InetAddress?, localPort: Int): Socket =
        Socket(host, port, localHost, localPort)

    override fun createSocket(host: InetAddress, port: Int): Socket = Socket(host, port)

    override fun createSocket(address: InetAddress, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
        Socket(address, port, localAddress, localPort)

    companion object {
        const val DEFAULT_TIMEOUT_MS = 15_000

        /** Wechselt zwischen den Adressfamilien, beginnend mit der vom System bevorzugten. */
        fun interleave(addresses: List<InetAddress>): List<InetAddress> {
            if (addresses.isEmpty()) return addresses
            val firstIsV6 = addresses.first() is Inet6Address
            val (preferred, other) = addresses.partition { (it is Inet6Address) == firstIsV6 }
            return (0 until maxOf(preferred.size, other.size)).flatMap { i ->
                listOfNotNull(preferred.getOrNull(i), other.getOrNull(i))
            }
        }
    }
}

private class MultiAddressSocket(private val resolve: (String) -> List<InetAddress>) : Socket() {
    override fun connect(endpoint: SocketAddress, timeout: Int) {
        val target = endpoint as? InetSocketAddress ?: return super.connect(endpoint, timeout)
        val addresses = try {
            MultiAddressSocketFactory.interleave(resolve(target.hostString))
        } catch (e: UnknownHostException) {
            throw e
        } catch (e: Exception) {
            throw UnknownHostException(target.hostString)
        }
        if (addresses.isEmpty()) throw UnknownHostException(target.hostString)
        if (addresses.size == 1) return super.connect(InetSocketAddress(addresses.first(), target.port), timeout)

        val total = if (timeout > 0) timeout else MultiAddressSocketFactory.DEFAULT_TIMEOUT_MS
        val perAttempt = maxOf(4_000, total / addresses.size)
        var lastError: IOException? = null
        for (address in addresses) {
            // Erst mit einer Probe-Verbindung prüfen: Ein fehlgeschlagener connect()
            // schließt diesen Socket endgültig, ein zweiter Versuch wäre dann nicht mehr möglich.
            val probe = Socket()
            try {
                probe.connect(InetSocketAddress(address, target.port), perAttempt)
            } catch (e: IOException) {
                lastError = e
                continue
            } finally {
                runCatching { probe.close() }
            }
            return super.connect(InetSocketAddress(address, target.port), timeout)
        }
        throw ConnectException("Keine Verbindung zu ${target.hostString}:${target.port}").apply {
            lastError?.let { initCause(it) }
        }
    }
}
