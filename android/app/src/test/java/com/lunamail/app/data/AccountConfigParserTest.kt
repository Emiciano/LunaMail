package com.lunamail.app.data

import org.junit.Assert.*
import org.junit.Test

class AccountConfigParserTest {
    val mobileconfig = """garbage\u0000<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>PayloadContent</key><array><dict>
<key>EmailAccountDescription</key><string>Hypnotic</string>
<key>EmailAccountName</key><string>Emilio</string>
<key>EmailAccountType</key><string>EmailTypeIMAP</string>
<key>EmailAddress</key><string>info@allseasonsproduction.de</string>
<key>IncomingMailServerAuthentication</key><string>EmailAuthPassword</string>
<key>IncomingMailServerHostName</key><string>mail.hypnotic.one</string>
<key>IncomingMailServerPortNumber</key><integer>993</integer>
<key>IncomingMailServerUseSSL</key><true/>
<key>IncomingMailServerUsername</key><string>info@allseasonsproduction.de</string>
<key>OutgoingMailServerHostName</key><string>mail.hypnotic.one</string>
<key>OutgoingMailServerPortNumber</key><integer>587</integer>
<key>OutgoingMailServerUseSSL</key><true/>
<key>PayloadType</key><string>com.apple.mail.managed</string>
</dict></array></dict></plist>sig"""

    @Test fun mobileconfigViaUrl() {
        val c = AccountConfigParser.resolve("https://x.example/p.mobileconfig") { mobileconfig.substringAfter("garbage\u0000").substringBefore("sig") }
        assertEquals("mail.hypnotic.one", c.imapHost); assertEquals(993, c.imapPort); assertEquals(Security.SSL, c.imapSecurity)
        assertEquals(587, c.smtpPort); assertEquals(Security.STARTTLS, c.smtpSecurity)
        assertEquals("info@allseasonsproduction.de", c.email); assertEquals("Emilio", c.displayName); assertFalse(c.popOnly)
    }
    @Test fun signedMobileconfig() {
        val c = AccountConfigParser.parse(mobileconfig)!!
        assertEquals("mail.hypnotic.one", c.smtpHost)
    }
    @Test fun autoconfig() {
        val c = AccountConfigParser.parse("""<clientConfig version="1.1"><emailProvider id="x"><displayName>X</displayName>
<incomingServer type="imap"><hostname>imap.x.de</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.x.de</hostname><port>465</port><socketType>SSL</socketType></outgoingServer></emailProvider></clientConfig>""")!!
        assertEquals(Security.STARTTLS, c.imapSecurity); assertEquals(Security.SSL, c.smtpSecurity); assertEquals("", c.username)
    }
    @Test fun imapUri() {
        val c = AccountConfigParser.parse("imaps://me%40x.de:geh%3Aeim@imap.x.de")!!
        assertEquals("me@x.de", c.email); assertEquals("geh:eim", c.password); assertEquals(993, c.imapPort); assertEquals("smtp.x.de", c.smtpHost)
    }
    @Test fun keyValues() {
        val c = AccountConfigParser.parse("E-Mail: a@b.de\nIMAP-Server: mail.b.de\nIMAP-Port: 993\nSMTP-Server: mail.b.de\nSMTP-Port: 465\nPasswort: x")!!
        assertEquals("mail.b.de", c.imapHost); assertEquals(Security.SSL, c.smtpSecurity); assertEquals("a@b.de", c.username); assertEquals("x", c.password)
    }
    @Test fun popOnly() {
        val c = AccountConfigParser.parse("POP3-Server: pop.b.de; Benutzer: a@b.de")!!
        assertTrue(c.popOnly)
    }
    @Test fun junk() {
        try { AccountConfigParser.resolve("hello world"); fail() } catch (_: AccountConfigException) {}
    }
}
