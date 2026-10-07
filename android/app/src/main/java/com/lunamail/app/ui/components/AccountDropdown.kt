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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
 * Aufklappbare Konto-Karte für die Postfächer-Übersicht: Zugeklappt steht nur die
 * E-Mail-Adresse mit Avatar und Ungelesen-Zahl da, aufgeklappt folgen die Postfächer.
 */
@Composable
fun AccountDropdown(
    email: String,
    name: String,
    unread: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val rotation by animateFloatAsState(if (expanded) 180f else 0f, tween(220), label = "dropdownChevron")
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Luna.colors.cell),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .cellPress(onToggle)
                .semantics {
                    role = Role.Button
                    stateDescription = if (expanded) "aufgeklappt" else "zugeklappt"
                }
                .heightIn(min = 60.dp)
                .padding(start = 14.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(name.ifBlank { email }, size = 36.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(email, style = LunaType.headline, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (name.isNotBlank() && !name.equals(email, ignoreCase = true)) {
                    Text(name, style = LunaType.footnote, color = Luna.colors.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (unread > 0) {
                Text(unread.toString(), style = LunaType.body, color = Luna.colors.secondaryLabel)
                Spacer(Modifier.width(6.dp))
            }
            Icon(
                LunaIcons.ChevronDown,
                contentDescription = if (expanded) "Zuklappen" else "Aufklappen",
                tint = Luna.colors.tertiaryLabel,
                modifier = Modifier.size(24.dp).rotate(rotation),
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(tween(240)) + fadeIn(tween(240)),
            exit = shrinkVertically(tween(200)) + fadeOut(tween(160)),
        ) {
            Column {
                HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator)
                content()
            }
        }
    }
}
