package com.lunamail.app.ui.components

import com.lunamail.app.ui.icons.LunaIcons
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeightScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType

/**
 * Aufklappbare Konto-Karte für den Ordner-Tab: Zugeklappt stehen Kontobild, Name, Adresse
 * und die Zahl ungelesener E-Mails da, aufgeklappt folgen die Ordner.
 */
@Composable
fun AccountDropdown(
    email: String,
    name: String,
    unread: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    avatar: @Composable () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val rotation by animateFloatAsState(if (expanded) 180f else 0f, tween(350), label = "dropdownChevron")
    val colors = Luna.colors
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(colors.cell),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .pressFade(onClick = onToggle)
                .semantics {
                    role = Role.Button
                    stateDescription = if (expanded) "aufgeklappt" else "zugeklappt"
                }
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            avatar()
            Spacer(Modifier.width(13.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    name.ifBlank { email },
                    style = LunaType.headline.copy(fontWeight = FontWeight.Bold),
                    color = colors.label,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (name.isNotBlank() && !name.equals(email, ignoreCase = true)) {
                    Text(email, style = LunaType.footnote, color = colors.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            AnimatedVisibility(visible = unread > 0 && !expanded, enter = fadeIn(), exit = fadeOut()) {
                Row {
                    Box(
                        Modifier
                            .heightIn(min = 22.dp)
                            .widthIn(min = 22.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(colors.red)
                            .padding(horizontal = 7.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(unread.toString(), style = LunaType.caption.copy(fontWeight = FontWeight.Bold), color = Color.White)
                    }
                    Spacer(Modifier.width(10.dp))
                }
            }
            Box(
                Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (colors.isSilver) colors.cellPressed else colors.background),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    LunaIcons.ChevronDown,
                    contentDescription = if (expanded) "Zuklappen" else "Aufklappen",
                    tint = colors.label,
                    modifier = Modifier.size(20.dp).rotate(rotation),
                )
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(tween(400, easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) + fadeIn(tween(240)),
            exit = shrinkVertically(tween(320, easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) + fadeOut(tween(160)),
        ) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 6.dp)) {
                content()
            }
        }
    }
}

/** Ordnerzeile mit Symbol-Kachel, Name, Zähler und Pfeil. */
@Composable
fun FolderRow(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: String?,
    selected: Boolean = false,
    showDivider: Boolean = true,
    onClick: () -> Unit,
) {
    val colors = Luna.colors
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(thickness = 1.dp, color = colors.separator)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).pressFade(onClick = onClick),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val shape = RoundedCornerShape(10.dp)
            Box(
                Modifier
                    .size(38.dp)
                    .then(
                        if (selected) Modifier.inverseSurface(colors.inverseBrush, shape)
                        else Modifier.clip(shape).background(if (colors.isSilver) colors.cellPressed else colors.background)
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = if (selected) colors.onInverse else colors.label, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(14.dp))
            Text(
                title,
                style = LunaType.headline,
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (count != null) {
                Text(count, style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold), color = colors.secondaryLabel)
                Spacer(Modifier.width(6.dp))
            }
            Icon(LunaIcons.ChevronRight, contentDescription = null, tint = colors.tertiaryLabel, modifier = Modifier.size(18.dp))
        }
    }
}
