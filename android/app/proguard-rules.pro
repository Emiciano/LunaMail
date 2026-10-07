# JavaMail lädt Provider und Handler per Reflection.
-keep class com.sun.mail.** { *; }
-keep class javax.mail.** { *; }
-keep class javax.activation.** { *; }
-keep class com.sun.activation.** { *; }
-keep class myjava.awt.datatransfer.** { *; }
-dontwarn java.awt.**
-dontwarn javax.security.sasl.**
-dontwarn com.sun.mail.**
-dontwarn javax.activation.**

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.lunamail.app.data.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.lunamail.app.data.**$$serializer { *; }

# Nur verkleinern und optimieren, nicht umbenennen: Fehlermeldungen und Stacktraces
# bleiben so lesbar.
-dontobfuscate
