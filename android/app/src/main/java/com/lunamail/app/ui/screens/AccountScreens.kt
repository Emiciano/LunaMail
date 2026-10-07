package com.lunamail.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.BuildConfig
import com.lunamail.app.data.Account
import com.lunamail.app.data.Providers
import com.lunamail.app.data.Security
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.BackButton
import com.lunamail.app.ui.components.CellRow
import com.lunamail.app.ui.components.GroupedSection
import com.lunamail.app.ui.components.LargeTitle
import com.lunamail.app.ui.components.NavigationBar
import com.lunamail.app.ui.components.TextAction
import com.lunamail.app.ui.components.cellPress
import com.lunamail.app.ui.components.rememberCollapsed
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import kotlinx.coroutines.launch
import java.util.UUID

/** Anbieterauswahl mit großen Wortmarken, wie beim Hinzufügen eines Accounts in iOS. */
@Composable
fun ProviderPickerScreen(onBack: () -> Unit, onPick: (String) -> Unit) {
    val background = Luna.colors.groupedBackground
    val listState = rememberLazyListState()
    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = "Account hinzufügen",
            collapsed = rememberCollapsed(listState),
            background = background,
            navigation = { BackButton("Zurück", onBack) },
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().navigationBarsPadding()) {
            item { LargeTitle("Account hinzufügen") }
            item {
                GroupedSection {
                    (Providers.all.map { it.id to it.name } + ("other" to "Andere")).forEachIndexed { index, (id, name) ->
                        Column(Modifier.fillMaxWidth().cellPress({ onPick(id) })) {
                            ProviderWordmark(id, name)
                            if (index < Providers.all.size) {
                                HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator)
                            }
                        }
                    }
                }
            }
            item {
                Text(
                    "LunaMail verbindet sich direkt per IMAP und SMTP mit deinem Anbieter. Passwörter werden verschlüsselt nur auf diesem Gerät gespeichert.",
                    style = LunaType.footnote,
                    color = Luna.colors.secondaryLabel,
                    modifier = Modifier.padding(32.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun ProviderWordmark(id: String, name: String) {
    val (color, weight, family) = when (id) {
        "icloud" -> Triple(Luna.colors.label, FontWeight.Medium, FontFamily.SansSerif)
        "google" -> Triple(Color(0xFF4285F4), FontWeight.Medium, FontFamily.SansSerif)
        "gmx" -> Triple(Color(0xFF1C449B), FontWeight.Black, FontFamily.SansSerif)
        "webde" -> Triple(Color(0xFFFFB400), FontWeight.Black, FontFamily.SansSerif)
        "tonline" -> Triple(Color(0xFFE20074), FontWeight.Bold, FontFamily.SansSerif)
        "ionos" -> Triple(Color(0xFF11388C), FontWeight.Bold, FontFamily.SansSerif)
        "yahoo" -> Triple(Color(0xFF6001D2), FontWeight.Black, FontFamily.Serif)
        else -> Triple(Luna.colors.label, FontWeight.Normal, FontFamily.SansSerif)
    }
    Box(Modifier.fillMaxWidth().heightIn(min = 72.dp), contentAlignment = Alignment.Center) {
        Text(
            name,
            fontSize = if (id == "other") 20.sp else 28.sp,
            fontWeight = weight,
            fontFamily = family,
            color = color,
        )
    }
}

@Composable
fun AccountFormScreen(vm: MailViewModel, providerId: String, onCancel: () -> Unit, onDone: () -> Unit) {
    val provider = Providers.byId(providerId)
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf(provider?.name.orEmpty()) }

    var imapHost by rememberSaveable { mutableStateOf(provider?.imapHost.orEmpty()) }
    var imapPort by rememberSaveable { mutableStateOf((provider?.imapPort ?: 993).toString()) }
    var imapSsl by rememberSaveable { mutableStateOf(provider?.imapSecurity != Security.STARTTLS) }
    var smtpHost by rememberSaveable { mutableStateOf(provider?.smtpHost.orEmpty()) }
    var smtpPort by rememberSaveable { mutableStateOf((provider?.smtpPort ?: 587).toString()) }
    var smtpSsl by rememberSaveable { mutableStateOf(provider?.smtpSecurity == Security.SSL) }
    var username by rememberSaveable { mutableStateOf("") }
    var showServers by rememberSaveable { mutableStateOf(provider == null) }

    var verifying by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun onEmailChange(value: String) {
        val domain = value.substringAfter('@', "").lowercase()
        if (provider == null && domain.contains('.')) {
            // Bekannte Anbieter automatisch erkennen, sonst die üblichen Hostnamen vorschlagen.
            val guess = Providers.guess(value)
            val oldDomain = email.substringAfter('@', "").lowercase()
            if (guess != null) {
                imapHost = guess.imapHost; imapPort = guess.imapPort.toString(); imapSsl = guess.imapSecurity == Security.SSL
                smtpHost = guess.smtpHost; smtpPort = guess.smtpPort.toString(); smtpSsl = guess.smtpSecurity == Security.SSL
                if (description.isBlank() || description == oldDomain) description = guess.name
            } else {
                if (imapHost.isBlank() || imapHost == "imap.$oldDomain") imapHost = "imap.$domain"
                if (smtpHost.isBlank() || smtpHost == "smtp.$oldDomain") smtpHost = "smtp.$domain"
                if (description.isBlank() || description == oldDomain) description = domain
            }
        }
        if (username.isBlank() || username == email) username = value
        email = value
    }

    val valid = email.contains('@') && password.isNotBlank() && imapHost.isNotBlank() && smtpHost.isNotBlank() &&
        imapPort.toIntOrNull() != null && smtpPort.toIntOrNull() != null

    fun submit() {
        val smtpPortNumber = smtpPort.toInt()
        val account = Account(
            id = UUID.randomUUID().toString(),
            displayName = name.ifBlank { email.substringBefore('@') },
            description = description.ifBlank { email },
            email = email.trim(),
            provider = provider?.id ?: "custom",
            imapHost = imapHost.trim(),
            imapPort = imapPort.toInt(),
            imapSecurity = if (imapSsl) Security.SSL else Security.STARTTLS,
            smtpHost = smtpHost.trim(),
            smtpPort = smtpPortNumber,
            smtpSecurity = if (smtpSsl) Security.SSL else Security.STARTTLS,
            username = username.ifBlank { email }.trim(),
        )
        verifying = true
        scope.launch {
            vm.addAccount(account, password)
                .onSuccess { onDone() }
                .onFailure { error = it.message; showServers = true }
            verifying = false
        }
    }

    val background = Luna.colors.groupedBackground
    Column(Modifier.fillMaxSize().background(background).imePadding()) {
        NavigationBar(
            title = provider?.name ?: "Andere",
            collapsed = true,
            background = background,
            navigation = { TextAction("Abbrechen", onClick = onCancel) },
            actions = {
                if (verifying) {
                    Row(Modifier.padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(strokeWidth = 2.dp, color = Luna.colors.secondaryLabel, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Überprüfen …", style = LunaType.body, color = Luna.colors.secondaryLabel)
                    }
                } else {
                    TextAction("Weiter", enabled = valid, bold = true) { submit() }
                }
            },
        )
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).navigationBarsPadding()) {
            GroupedSection(footer = provider?.hint) {
                FormField("Name", name, { name = it }, "Max Mustermann")
                FormField("E-Mail", email, ::onEmailChange, "name@beispiel.de", KeyboardType.Email)
                FormField("Passwort", password, { password = it }, "Erforderlich", KeyboardType.Password, secret = true)
                FormField("Beschreibung", description, { description = it }, provider?.name ?: "Mein Account", last = true)
            }

            if (showServers) {
                GroupedSection(header = "Server für eintreffende E-Mails") {
                    FormField("Host", imapHost, { imapHost = it }, "imap.beispiel.de", KeyboardType.Uri)
                    FormField("Benutzer", username, { username = it }, "Erforderlich", KeyboardType.Email)
                    FormField("Port", imapPort, { imapPort = it }, "993", KeyboardType.Number)
                    ToggleRow("SSL/TLS", imapSsl) { imapSsl = it; imapPort = if (it) "993" else "143" }
                }
                GroupedSection(header = "Server für ausgehende E-Mails") {
                    FormField("Host", smtpHost, { smtpHost = it }, "smtp.beispiel.de", KeyboardType.Uri)
                    FormField("Port", smtpPort, { smtpPort = it }, "587", KeyboardType.Number)
                    ToggleRow("SSL/TLS (sonst STARTTLS)", smtpSsl) { smtpSsl = it; smtpPort = if (it) "465" else "587" }
                }
            } else {
                GroupedSection {
                    CellRow("Servereinstellungen", showDivider = false, titleColor = Luna.colors.accent, showChevron = false) {
                        showServers = true
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    error?.let { message ->
        AlertDialog(
            onDismissRequest = { error = null },
            title = { Text("Account kann nicht überprüft werden") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } },
        )
    }
}

@Composable
private fun FormField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    secret: Boolean = false,
    last: Boolean = false,
) {
    Column {
        Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = LunaType.body, color = Luna.colors.label, modifier = Modifier.width(118.dp))
            Box(Modifier.weight(1f)) {
                if (value.isEmpty()) Text(placeholder, style = LunaType.body, color = Luna.colors.tertiaryLabel, maxLines = 1)
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = LunaType.body.copy(color = Luna.colors.label),
                    cursorBrush = SolidColor(Luna.colors.accent),
                    visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(keyboardType = keyboardType, autoCorrectEnabled = false),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (!last) HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator, modifier = Modifier.padding(start = 16.dp))
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = LunaType.body, color = Luna.colors.label, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Luna.colors.green,
                checkedThumbColor = Color.White,
                checkedBorderColor = Color.Transparent,
                uncheckedTrackColor = Luna.colors.fill,
                uncheckedThumbColor = Color.White,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

@Composable
fun SettingsScreen(vm: MailViewModel, onBack: () -> Unit, onAddAccount: () -> Unit) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    var removing by remember { mutableStateOf<Account?>(null) }
    val listState = rememberLazyListState()
    val background = Luna.colors.groupedBackground

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = "Einstellungen",
            collapsed = rememberCollapsed(listState),
            background = background,
            navigation = { BackButton("Postfächer", onBack) },
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().navigationBarsPadding()) {
            item { LargeTitle("Einstellungen") }
            item {
                GroupedSection(header = "Accounts", footer = "Tippe auf einen Account, um ihn von diesem Gerät zu entfernen.") {
                    accounts.forEach { account ->
                        CellRow(title = account.description, value = account.email, showChevron = false) { removing = account }
                    }
                    CellRow("Account hinzufügen", titleColor = Luna.colors.accent, showDivider = false, showChevron = false, onClick = onAddAccount)
                }
            }
            item {
                GroupedSection(header = "Über") {
                    CellRow("Version", value = BuildConfig.VERSION_NAME, showChevron = false, showDivider = false) {}
                }
            }
            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    removing?.let { account ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("„${account.description}“ entfernen?") },
            text = { Text("Der Account und seine zwischengespeicherten E-Mails werden von diesem Gerät gelöscht. Auf dem Server bleibt alles erhalten.") },
            confirmButton = {
                TextButton(onClick = { vm.removeAccount(account.id); removing = null }) {
                    Text("Entfernen", color = Luna.colors.red)
                }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Abbrechen") } },
        )
    }
}
