package com.zenith.kratos.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

private val DarkColorScheme = darkColorScheme(
    primary = ZenithAccent,
    secondary = ZenithSecondary,
    background = ZenithBackground,
    surface = ZenithSurface,
    onPrimary = ZenithOnAccent,
    onSecondary = ZenithOnAccent,
    onBackground = Color(0xFFF8FAFC),
    onSurface = Color(0xFFF8FAFC),
    error = ZenithError
)

/**
 * The ground every screen sits on: top-left to bottom-right, black into deep teal.
 *
 * `Offset.Infinite` is the drawing area's far corner, so the gradient runs the diagonal
 * of whatever it is applied to rather than a fixed number of pixels - it looks the same
 * on a tall phone as on a short one.
 */
val ZenithScreenBrush: Brush = Brush.linearGradient(
    colors = listOf(ZenithGradientTop, ZenithGradientBottom),
    start = Offset.Zero,
    end = Offset.Infinite
)

/**
 * The wordmark face. The design calls for Palatino, which no Android device ships;
 * FontFamily.Serif resolves to Noto Serif, which carries the same old-style weight
 * against the sans everything else is set in.
 */
val KratosWordmark: FontFamily = FontFamily.Serif

@Composable
fun KratosPilotTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
