package com.zenith.daily.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = ZenithPrimary,
    secondary = ZenithSecondary,
    background = ZenithBackground,
    surface = ZenithSurface,
    onPrimary = ZenithBackground,
    onSecondary = ZenithTextPrimary,
    onBackground = ZenithTextPrimary,
    onSurface = ZenithTextPrimary
)

@Composable
fun ZenithDailyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
