# LunaMail

Windows-Mail-App mit Electron, React, TypeScript, IMAP und SMTP.

## Voraussetzungen

- Node.js 22 LTS oder neuer
- npm

Rust, Tauri, WebView2 und Visual Studio C++ Build Tools werden nicht mehr benötigt.

## Entwicklung

```powershell
npm install
npm run dev
```

`npm run dev` startet Vite und anschließend Electron.

## Windows-Installer

```powershell
npm install
npm run build:desktop
```

Der NSIS-Installer wird hier erzeugt:

```text
release\LunaMail-Setup-0.9.37.exe
```

## Google-Konto verbinden

Für die Google-Anmeldung benötigt LunaMail eine OAuth-Client-ID vom Typ **Desktop-App**:

1. In der [Google Cloud Console](https://console.cloud.google.com/auth/clients) ein Projekt und einen OAuth-Client vom Typ **Desktop-App** anlegen.
2. Unter Datenzugriff den Scope `https://mail.google.com/` konfigurieren.
3. Die erzeugte Client-ID in LunaMail unter **Einstellungen > Konten > Gmail hinzufügen** eintragen.
4. Auf **Mit Google anmelden** klicken. Die Anmeldung findet im Standardbrowser statt.

Für eine öffentliche Verteilung muss Google den eingeschränkten Gmail-Scope gegebenenfalls verifizieren.

## Updates über GitHub

Installierte Versionen prüfen beim Start automatisch und über
`Einstellungen > Über > Auf Updates prüfen` nach neuen GitHub-Releases.

Für ein neues Release:

1. Version in `package.json` und `package-lock.json` erhöhen.
2. Änderungen committen und pushen.
3. Einen passenden Tag erstellen und pushen, zum Beispiel `v1.0.0`.

Der GitHub-Workflow baut und veröffentlicht den Installer, die Blockmap und
`latest.yml`. Diese Dateien müssen gemeinsam im GitHub-Release vorhanden sein.

## Architektur

- `electron/main.mjs`: Fenster, Tray, Dialoge und IPC
- `electron/preload.cjs`: abgesicherte Renderer-Bridge
- `electron/backend.mjs`: Accounts, lokaler Speicher, IMAP, SMTP und Backups
- `src/`: React-Oberfläche

Passwörter werden mit Electrons `safeStorage` über den Windows-Benutzerschutz verschlüsselt. Der lokale App-Zustand liegt im Electron-Benutzerdatenordner als `lunamail.json`.

Der frühere Rust/Tauri-Code unter `src-tauri` wird nicht mehr gebaut. Dort werden aktuell nur noch die vorhandenen Windows-Icons für das Electron-Paket verwendet.
