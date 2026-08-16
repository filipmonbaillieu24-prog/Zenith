package com.zenith.daily.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.daily.data.DailyMealLog
import com.zenith.daily.data.HealthConnectSnapshot
import com.zenith.daily.data.MacroGoals
import com.zenith.daily.data.WeightLog
import com.zenith.daily.ui.theme.*

@Composable
fun TodayScreen(
    todayMeals: List<DailyMealLog>,
    weights: List<WeightLog>,
    macroGoals: MacroGoals,
    healthSnapshot: HealthConnectSnapshot,
    onOpenLogWeightModal: () -> Unit,
    onOpenLogMealModal: () -> Unit,
    modifier: Modifier = Modifier
) {
    val totalCalories = todayMeals.sumOf { it.calories }
    val totalProtein = todayMeals.sumOf { it.proteinG }
    val totalCarbs = todayMeals.sumOf { it.carbsG }
    val totalFat = todayMeals.sumOf { it.fatG }
    val remaining = macroGoals.dailyCalorieTarget - totalCalories

    val calorieProgress = (totalCalories.toFloat() / macroGoals.dailyCalorieTarget.toFloat()).coerceIn(0f, 1f)
    val proteinProgress = (totalProtein.toFloat() / macroGoals.proteinTargetG.toFloat()).coerceIn(0f, 1f)
    val carbsProgress = (totalCarbs.toFloat() / macroGoals.carbsTargetG.toFloat()).coerceIn(0f, 1f)
    val fatProgress = (totalFat.toFloat() / macroGoals.fatTargetG.toFloat()).coerceIn(0f, 1f)

    val latestWeight = weights.firstOrNull()
    val previousWeight = weights.getOrNull(1)
    val weightDelta = if (latestWeight != null && previousWeight != null) {
        latestWeight.weightKg - previousWeight.weightKg
    } else null

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ZenithBackground)
            .padding(horizontal = 18.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(modifier = Modifier.height(6.dp))

        // 1. Calorie & Macro Hero Card
        Card(
            colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, ZenithBorder, RoundedCornerShape(20.dp))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "DAGELIJKSE CALORIEËN",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ZenithSecondary,
                            letterSpacing = 1.sp
                        )
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                text = "$totalCalories",
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Black,
                                color = ZenithTextPrimary
                            )
                            Text(
                                text = " / ${macroGoals.dailyCalorieTarget} kcal",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZenithSecondary,
                                modifier = Modifier.padding(bottom = 4.dp, start = 4.dp)
                            )
                        }
                    }

                    // Remaining indicator badge
                    val remaining = macroGoals.dailyCalorieTarget - totalCalories
                    Box(
                        modifier = Modifier
                            .background(
                                if (remaining >= 0) ZenithPrimary.copy(alpha = 0.12f) else ZenithError.copy(alpha = 0.12f),
                                RoundedCornerShape(10.dp)
                            )
                            .border(
                                1.dp,
                                if (remaining >= 0) ZenithPrimary.copy(alpha = 0.3f) else ZenithError.copy(alpha = 0.3f),
                                RoundedCornerShape(10.dp)
                            )
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = if (remaining >= 0) "$remaining kcal over" else "${-remaining} kcal te veel",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (remaining >= 0) ZenithPrimary else ZenithError
                        )
                    }
                }

                // Calorie Progress Bar
                LinearProgressIndicator(
                    progress = { calorieProgress },
                    color = if (remaining >= 0) ZenithPrimary else ZenithError,
                    trackColor = ZenithSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .clip(RoundedCornerShape(5.dp))
                )

                Divider(color = ZenithBorder.copy(alpha = 0.6f), thickness = 1.dp)

                // Macro Progress Bars Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    MacroBarItem(
                        label = "Eiwit",
                        currentG = Math.round(totalProtein * 10) / 10.0,
                        targetG = macroGoals.proteinTargetG,
                        progress = proteinProgress,
                        color = ZenithAccentBlue,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    MacroBarItem(
                        label = "Koolh.",
                        currentG = Math.round(totalCarbs * 10) / 10.0,
                        targetG = macroGoals.carbsTargetG,
                        progress = carbsProgress,
                        color = ZenithAccentOrange,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    MacroBarItem(
                        label = "Vetten",
                        currentG = Math.round(totalFat * 10) / 10.0,
                        targetG = macroGoals.fatTargetG,
                        progress = fatProgress,
                        color = ZenithAccentPurple,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        // 2. Weight Status Card & Health Connect Grid Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Weight Card
            Card(
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, ZenithBorder, RoundedCornerShape(18.dp))
                    .clickable { onOpenLogWeightModal() }
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "GEWICHT",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ZenithSecondary,
                            letterSpacing = 1.sp
                        )
                        Text(
                            text = "＋ LOG",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = ZenithPrimary
                        )
                    }

                    if (latestWeight != null) {
                        Text(
                            text = "${latestWeight.weightKg} kg",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Black,
                            color = ZenithTextPrimary
                        )
                        if (weightDelta != null) {
                            val deltaStr = if (weightDelta > 0) "+${Math.round(weightDelta * 10) / 10.0} kg" else "${Math.round(weightDelta * 10) / 10.0} kg"
                            val deltaColor = if (weightDelta <= 0) ZenithPrimary else ZenithAccentOrange
                            Text(
                                text = "$deltaStr t.o.v. vorig gewicht",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = deltaColor
                            )
                        } else {
                            Text(
                                text = "Laatst gelogd: ${latestWeight.date}",
                                fontSize = 10.sp,
                                color = ZenithSecondary
                            )
                        }
                    } else {
                        Text(
                            text = "— kg",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Black,
                            color = ZenithSecondary
                        )
                        Text(
                            text = "Klik om gewicht in te voeren",
                            fontSize = 10.sp,
                            color = ZenithSecondary
                        )
                    }
                }
            }

            // Health Connect Card
            Card(
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, ZenithBorder, RoundedCornerShape(18.dp))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "HEALTH CONNECT",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = ZenithSecondary,
                        letterSpacing = 1.sp
                    )

                    Text(
                        text = "${healthSnapshot.stepsCount} stappen",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZenithTextPrimary
                    )

                    Text(
                        text = "🔥 ${healthSnapshot.activeCaloriesBurned} kcal verbrand",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZenithAccentOrange
                    )
                }
            }
        }

        // 3. Quick Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onOpenLogMealModal,
                colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp)
            ) {
                Text(
                    text = "＋ MAALTIJD LOGGEN",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.5.sp
                )
            }

            Button(
                onClick = onOpenLogWeightModal,
                colors = ButtonDefaults.buttonColors(containerColor = ZenithSurface, contentColor = ZenithTextPrimary),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp)
                    .border(1.dp, ZenithBorder, RoundedCornerShape(14.dp))
            ) {
                Text(
                    text = "＋ GEWICHT LOGGEN",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
            }
        }

        // 4. Today's Logged Meals Summary Section
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(ZenithCardBg, RoundedCornerShape(18.dp))
                .border(1.dp, ZenithBorder, RoundedCornerShape(18.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "GELOGDE MAALTIJDEN VANDAAG (${todayMeals.size})",
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZenithSecondary,
                letterSpacing = 1.sp
            )

            if (todayMeals.isEmpty()) {
                Text(
                    text = "Nog geen maaltijden gelogd vandaag. Klik op + Maaltijd Loggen.",
                    fontSize = 11.sp,
                    color = ZenithSecondary,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            } else {
                todayMeals.forEach { meal ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ZenithSurface, RoundedCornerShape(10.dp))
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = meal.foodName,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZenithTextPrimary
                            )
                            Text(
                                text = "${meal.mealType} • ${meal.proteinG}g Eiwit • ${meal.carbsG}g C • ${meal.fatG}g V",
                                fontSize = 10.sp,
                                color = ZenithSecondary
                            )
                        }

                        Text(
                            text = "${meal.calories} kcal",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ZenithPrimary
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
fun MacroBarItem(
    label: String,
    currentG: Double,
    targetG: Double,
    progress: Float,
    color: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithSecondary)
            Text(text = "${currentG.toInt()}/${targetG.toInt()}g", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary)
        }
        LinearProgressIndicator(
            progress = { progress },
            color = color,
            trackColor = ZenithSurface,
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
        )
    }
}
