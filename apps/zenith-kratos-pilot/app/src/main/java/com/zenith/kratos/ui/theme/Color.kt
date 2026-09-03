package com.zenith.kratos.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The Kratos palette.
 *
 * One accent - a cold sky blue - on a near-black ground that warms towards deep teal
 * down the diagonal. Everything else is a neutral: the accent is spent on exactly two
 * jobs, marking the set you are on and the action that moves the session forward, and
 * a screen that used it anywhere else would stop pointing at either.
 *
 * Amber and red are semantic and separate from the accent. Amber means a lift has
 * stopped moving or a personal record was set - both things worth reading before you
 * lift rather than after. Red only ever means destructive.
 */

// The screen ground, top-left to bottom-right.
val ZenithGradientTop = Color(0xFF090A0C)
val ZenithGradientBottom = Color(0xFF0D2634)

val ZenithBackground = Color(0xFF09090B)
/** Opaque - sheets and dialogs, which sit over the gradient and must not show it. */
val ZenithSurface = Color(0xFF1C1C23)
/** Number fields and keypad keys. */
val ZenithField = Color(0xFF27272E)
/** rgba(255,255,255,0.045) - cards that let the gradient through. */
val ZenithGlass = Color(0x0BFFFFFF)
/** rgba(255,255,255,0.08) - the hairline around them. */
val ZenithGlassBorder = Color(0x14FFFFFF)
val ZenithDivider = Color(0x0DFFFFFF)

val ZenithAccent = Color(0xFF38BDF8)
/** The same accent as text or an icon on a dark ground, where the solid tone glares. */
val ZenithAccentSoft = Color(0xFF7DD3FC)
val ZenithAccentTint = Color(0x1A38BDF8)   // 10% - fills
val ZenithAccentTintStrong = Color(0x2E38BDF8) // 18% - badges
val ZenithAccentBorder = Color(0x5938BDF8) // 35%
/** Text and icons sitting ON the accent. */
val ZenithOnAccent = Color(0xFF09090B)
/** The login button reads a shade lighter, against nothing but the gradient. */
val ZenithLoginAccent = Color(0xFF45BBEF)

val ZenithPrimary = Color(0xFFCBD5E1)    // Brushed steel - bright neutral text
val ZenithBright = Color(0xFFE2E8F0)
val ZenithSecondary = Color(0xFF94A3B8)  // Muted steel - labels and captions
val ZenithMuted = Color(0xFF5A6472)      // Dimmer still - column headings, spent rows
val ZenithDot = Color(0xFF64748B)        // The outline of an unfilled set dot

val ZenithWarning = Color(0xFFF5A623)
val ZenithSuccess = Color(0xFF4ADE80)
val ZenithError = Color(0xFFEF4444)
val ZenithBorder = Color(0xFF27272A)

/** Kept as the old name so the twenty call sites that mean "the accent" keep meaning it. */
val ZenithAccentNeon = ZenithAccent
