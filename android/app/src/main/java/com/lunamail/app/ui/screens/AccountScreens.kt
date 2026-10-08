package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
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
import com.lunamail.app.ui.theme.SilverMetal
import com.lunamail.app.ui.theme.ThemeMode
import com.lunamail.app.ui.theme.screenBackground
import com.lunamail.app.ui.components.AccountAvatar
import com.lunamail.app.ui.components.PageTitle
import com.lunamail.app.ui.components.SquareButton
import com.lunamail.app.ui.components.pressFade
import com.lunamail.app.ui.components.pressScale
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.lunamail.app.data.AccountConfig
import com.lunamail.app.data.AccountConfigException
import com.lunamail.app.data.AccountConfigParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

/** Anbieterauswahl mit großen Wortmarken, wie beim Hinzufügen eines Accounts in iOS. */
@Composable
fun ProviderPickerScreen(onBack: () -> Unit, onPick: (String) -> Unit, onScanned: (AccountConfig) -> Unit) {
    val background = Luna.colors.groupedBackground
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun scan() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(context, options).startScan()
            .addOnSuccessListener { barcode ->
                val raw = barcode.rawValue ?: return@addOnSuccessListener
                loading = true
                scope.launch {
                    runCatching { withContext(Dispatchers.IO) { AccountConfigParser.resolve(raw) } }
                        .onSuccess { config ->
                            if (config.popOnly) {
                                error = "Dieser QR-Code richtet ein POP3-Konto ein. LunaMail braucht IMAP – bitte den QR-Code für IMAP scannen."
                            } else {
                                onScanned(config)
                            }
                        }
                        .onFailure {
                            error = (it as? AccountConfigException)?.message
                                ?: "Die Einstellungen aus dem QR-Code konnten nicht geladen werden. Bitte die Internetverbindung prüfen."
                        }
                    loading = false
                }
            }
            .addOnFailureListener {
                error = "Der QR-Scanner konnte nicht gestartet werden. Er benötigt die Google-Play-Dienste."
            }
    }

    Column(Modifier.fillMaxSize().screenBackground()) {
        NavigationBar(
            title = "Account hinzufügen",
            collapsed = rememberCollapsed(listState),
            background = background,
            navigation = { BackButton("Zurück", onBack) },
            actions = {
                if (loading) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = Luna.colors.secondaryLabel,
                        modifier = Modifier.padding(end = 16.dp).size(18.dp),
                    )
                }
            },
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().navigationBarsPadding()) {
            item { LargeTitle("Account hinzufügen") }
            item {
                GroupedSection(footer = "Zum Beispiel den IMAP-QR-Code aus Hypnotic One oder deinem Hosting-Panel.") {
                    CellRow(
                        title = if (loading) "Einstellungen werden geladen …" else "QR-Code scannen",
                        icon = LunaIcons.ScanQr,
                        showDivider = false,
                        onClick = { if (!loading) scan() },
                    )
                }
            }
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

    error?.let { message ->
        AlertDialog(
            onDismissRequest = { error = null },
            title = { Text("QR-Code nicht verwendbar") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } },
        )
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
        "hypnotic" -> Triple(Color(0xFF7B3FE4), FontWeight.SemiBold, FontFamily.SansSerif)
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
fun AccountFormScreen(
    vm: MailViewModel,
    providerId: String,
    onCancel: () -> Unit,
    onDone: () -> Unit,
    prefill: AccountConfig? = null,
) {
    val provider = Providers.byId(providerId)
    var name by rememberSaveable { mutableStateOf(prefill?.displayName.orEmpty()) }
    var email by rememberSaveable { mutableStateOf(prefill?.email.orEmpty()) }
    var password by rememberSaveable { mutableStateOf(prefill?.password.orEmpty()) }
    var description by rememberSaveable {
        mutableStateOf(provider?.name ?: prefill?.description?.ifBlank { null } ?: prefill?.email?.substringAfter('@', "").orEmpty())
    }

    var imapHost by rememberSaveable { mutableStateOf(prefill?.imapHost ?: provider?.imapHost.orEmpty()) }
    var imapPort by rememberSaveable { mutableStateOf((prefill?.imapPort ?: provider?.imapPort ?: 993).toString()) }
    // Unverschlüsselte Verbindungen bietet das Formular nicht an; sie werden zu STARTTLS.
    var imapSsl by rememberSaveable { mutableStateOf((prefill?.imapSecurity ?: provider?.imapSecurity ?: Security.SSL) == Security.SSL) }
    var smtpHost by rememberSaveable { mutableStateOf(prefill?.smtpHost ?: provider?.smtpHost.orEmpty()) }
    var smtpPort by rememberSaveable { mutableStateOf((prefill?.smtpPort ?: provider?.smtpPort ?: 587).toString()) }
    var smtpSsl by rememberSaveable { mutableStateOf((prefill?.smtpSecurity ?: provider?.smtpSecurity) == Security.SSL) }
    var username by rememberSaveable { mutableStateOf(prefill?.username.orEmpty()) }
    var showServers by rememberSaveable { mutableStateOf(provider == null) }

    var verifying by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun onEmailChange(value: String) {
        val domain = value.substringAfter('@', "").lowercase()
        if (provider == null && prefill == null && domain.contains('.')) {
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
    Column(Modifier.fillMaxSize().screenBackground().imePadding()) {
        NavigationBar(
            title = provider?.name ?: if (prefill != null) "QR-Code" else "Andere",
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
            val footer = provider?.hint ?: if (prefill != null) {
                if (prefill.password.isBlank()) "Einstellungen aus dem QR-Code übernommen. Bitte noch das Passwort eingeben."
                else "Einstellungen aus dem QR-Code übernommen."
            } else null
            GroupedSection(footer = footer) {
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
                checkedTrackColor = Luna.colors.inverse,
                checkedThumbColor = Luna.colors.onInverse,
                checkedBorderColor = Color.Transparent,
                uncheckedTrackColor = Luna.colors.fill,
                uncheckedThumbColor = Color.White,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

/** Konto-Tab: Profil, Schnellzugriffe, Design-Auswahl, Konten mit Bild und Einstellungen. */
@Composable
fun AccountTabScreen(vm: MailViewModel, onAddAccount: () -> Unit, bottomInset: androidx.compose.ui.unit.Dp) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val pictures by vm.pictures.collectAsStateWithLifecycle()
    val theme by vm.theme.collectAsStateWithLifecycle()
    val notifications by vm.notifications.collectAsStateWithLifecycle()
    val swipeArchives by vm.swipeArchives.collectAsStateWithLifecycle()
    var removing by remember { mutableStateOf<Account?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    val pickPicture = rememberPicturePicker(vm)
    val colors = Luna.colors
    val me = accounts.firstOrNull()

    LazyColumn(
        Modifier.fillMaxSize().screenBackground().windowInsetsPadding(WindowInsets.statusBars),
        contentPadding = PaddingValues(top = 8.dp, bottom = bottomInset + 24.dp),
    ) {
        item { PageTitle("Konto") }
        item {
            Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                AccountAvatar(me, me?.let { vm.pictureFile(it.id) }, me?.let { pictures[it.id] }, size = 64.dp, radius = 32.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        me?.displayName?.ifBlank { null } ?: me?.description ?: "LunaMail",
                        style = LunaType.title2.copy(fontSize = 24.sp),
                        color = colors.label,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        when (accounts.size) {
                            0 -> "Kein Konto verbunden"
                            1 -> "1 Konto verbunden"
                            else -> "${accounts.size} Konten verbunden"
                        },
                        style = LunaType.subhead,
                        color = colors.secondaryLabel,
                    )
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                QuickAction("Konto", LunaIcons.Plus, Modifier.weight(1f), onAddAccount)
                QuickAction("QR-Setup", LunaIcons.ScanQr, Modifier.weight(1f), onAddAccount)
            }
        }
        item {
            SettingsGroup("Design") {
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    ThemeMode.entries.forEach { mode ->
                        ThemeTile(mode, selected = mode == theme, modifier = Modifier.weight(1f)) { vm.setTheme(mode) }
                    }
                }
            }
        }
        item {
            SettingsGroup("Konten · Tippe aufs Bild, um es zu ändern") {
                accounts.forEach { account ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        AccountAvatar(account, vm.pictureFile(account.id), pictures[account.id], size = 52.dp, onEdit = { pickPicture(account.id) })
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                account.description,
                                style = LunaType.headline.copy(fontWeight = FontWeight.Bold),
                                color = colors.label,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(account.email, style = LunaType.footnote, color = colors.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Box {
                            SquareButton(LunaIcons.More, "Optionen", size = 36.dp) { menuFor = account.id }
                            DropdownMenu(expanded = menuFor == account.id, onDismissRequest = { menuFor = null }) {
                                DropdownMenuItem(text = { Text("Bild ändern") }, onClick = { menuFor = null; pickPicture(account.id) })
                                if (pictures.containsKey(account.id)) {
                                    DropdownMenuItem(text = { Text("Bild entfernen") }, onClick = { menuFor = null; vm.removeAccountPicture(account.id) })
                                }
                                DropdownMenuItem(
                                    text = { Text("Konto entfernen", color = colors.red) },
                                    onClick = { menuFor = null; removing = account },
                                )
                            }
                        }
                    }
                    HorizontalDivider(thickness = 1.dp, color = colors.separator)
                }
            }
        }
        item {
            SettingsGroup("Einstellungen") {
                SettingRow(LunaIcons.Bell, "Mitteilungen", "Bei jeder neuen E-Mail", notifications) { vm.setNotifications(it) }
                SettingRow(LunaIcons.Archive, "Wischen archiviert", "Nach links wischen legt ins Archiv statt in den Papierkorb", swipeArchives) {
                    vm.setSwipeArchives(it)
                }
                Text(
                    "LunaMail ${BuildConfig.VERSION_NAME}",
                    style = LunaType.footnote,
                    color = colors.tertiaryLabel,
                    modifier = Modifier.padding(top = 18.dp),
                )
            }
        }
    }

    removing?.let { account ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("„${account.description}“ entfernen?") },
            text = { Text("Das Konto und seine zwischengespeicherten E-Mails werden von diesem Gerät gelöscht. Auf dem Server bleibt alles erhalten.") },
            confirmButton = {
                TextButton(onClick = { vm.removeAccount(account.id); removing = null }) {
                    Text("Entfernen", color = colors.red)
                }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Abbrechen", color = colors.label) } },
        )
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 22.dp)) {
        Text(title, style = LunaType.sectionLabel, color = Luna.colors.secondaryLabel, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        content()
    }
}

@Composable
private fun QuickAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .height(86.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Luna.colors.cell)
            .pressScale(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Luna.colors.label, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(8.dp))
        Text(label, style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold), color = Luna.colors.label)
    }
}

/** Vorschau eines Designs mit angedeuteten Karten, wie im Prototyp. */
@Composable
private fun ThemeTile(mode: ThemeMode, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(12.dp)
    val (background, bar, strong) = when (mode) {
        ThemeMode.Light -> Triple<Brush, Brush, Brush>(SolidColor(Color.White), SolidColor(Color(0xFFF0F0F0)), SolidColor(Color.Black))
        ThemeMode.Dark -> Triple<Brush, Brush, Brush>(SolidColor(Color.Black), SolidColor(Color(0xFF1C1C1C)), SolidColor(Color.White))
        ThemeMode.Silver -> Triple(
            Brush.radialGradient(0f to Color(0xFF8D9097), 0.6f to Color(0xFF3A3B3F), 1f to Color(0xFF1F2023), center = Offset(60f, 20f), radius = 420f),
            SolidColor(Color(0x24FFFFFF)),
            SilverMetal,
        )
    }
    Column(modifier.pressScale(scale = 0.97f, onClick = onClick)) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(118.dp)
                .then(if (selected) Modifier.border(3.dp, colors.cellPressed, RoundedCornerShape(15.dp)).padding(3.dp) else Modifier.padding(3.dp))
                .clip(shape)
                .background(background)
                .border(if (selected) 2.dp else 1.dp, if (selected) colors.label else Color(0x407F7F7F), shape),
        ) {
            Box(Modifier.padding(start = 10.dp, end = 34.dp, top = 12.dp).fillMaxWidth().height(16.dp).clip(RoundedCornerShape(5.dp)).background(bar))
            Box(Modifier.padding(start = 10.dp, end = 10.dp, top = 36.dp).fillMaxWidth().height(30.dp).clip(RoundedCornerShape(5.dp)).background(strong))
            Box(Modifier.padding(start = 10.dp, top = 72.dp).fillMaxWidth(0.4f).height(16.dp).clip(RoundedCornerShape(5.dp)).background(bar))
            Box(Modifier.align(Alignment.TopEnd).padding(top = 12.dp, end = 10.dp).size(16.dp).clip(CircleShape).background(strong))
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (selected) {
                Icon(LunaIcons.Check, contentDescription = null, tint = colors.label, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(5.dp))
            }
            Text(
                mode.label,
                style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold),
                color = if (selected) colors.label else colors.secondaryLabel,
            )
        }
    }
}

@Composable
private fun SettingRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    val colors = Luna.colors
    Column {
        Row(Modifier.fillMaxWidth().heightIn(min = 62.dp).pressFade { onChange(!checked) }, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(10.dp)).background(colors.cell), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = colors.label, modifier = Modifier.size(21.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                Text(title, style = LunaType.headline, color = colors.label)
                Text(subtitle, style = LunaType.footnote, color = colors.secondaryLabel)
            }
            Spacer(Modifier.width(8.dp))
            LunaSwitch(checked, onChange)
        }
        HorizontalDivider(thickness = 1.dp, color = colors.separator)
    }
}

@Composable
private fun LunaSwitch(checked: Boolean, onChange: (Boolean) -> Unit) {
    val colors = Luna.colors
    Switch(
        checked = checked,
        onCheckedChange = onChange,
        colors = SwitchDefaults.colors(
            checkedTrackColor = colors.inverse,
            checkedThumbColor = colors.onInverse,
            checkedBorderColor = Color.Transparent,
            uncheckedTrackColor = colors.strongFill,
            uncheckedThumbColor = Color.White,
            uncheckedBorderColor = Color.Transparent,
        ),
    )
}
