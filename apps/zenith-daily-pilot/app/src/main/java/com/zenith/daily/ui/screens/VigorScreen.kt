package com.zenith.daily.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.daily.data.HealthConnectSnapshot
import com.zenith.daily.data.WeightLog
import com.zenith.daily.ui.theme.*

@Composable
fun VigorScreen(
    weights: List<WeightLog>,
    healthSnapshot: HealthConnectSnapshot,
    onSaveWeight: (weightKg: Double, bodyFatPct: Double?) -> Unit,
    onDeleteWeight: (id: String) -> Unit,
    onRequestHealthPermissions: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showLogModal by remember { mutableStateOf(false) }
    var weightInput by remember { mutableStateOf("") }
    var bodyFatInput by remember { mutableStateOf("") }

    val latestWeight = weights.firstOrNull()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ZenithBackground)
            .padding(horizontal = 18.dp)
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        // Header Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "ZENITH VIGOR",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    color = ZenithTextPrimary
                )
                Text(
                    text = "Gewicht & Gezondheid Synchronisatie",
                    fontSize = 11.sp,
                    color = ZenithSecondary
                )
            }

            Button(
                onClick = { showLogModal = true },
                colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                modifier = Modifier.height(36.dp)
            ) {
                Text("＋ LOG GEWICHT", fontSize = 10.sp, fontWeight = FontWeight.Black)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 1. Health Connect Status Card
        Card(
            colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, ZenithBorder, RoundedCornerShape(16.dp))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Android Health Connect",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZenithTextPrimary
                    )
                    Text(
                        text = if (healthSnapshot.isConnected) "Status: Verbonden (Stappen & Calorieën)" else "Status: Automatische sync beschikbaar",
                        fontSize = 10.sp,
                        color = ZenithSecondary
                    )
                }

                Button(
                    onClick = onRequestHealthPermissions,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (healthSnapshot.isConnected) ZenithPrimary.copy(alpha = 0.15f) else ZenithSurface
                    ),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    modifier = Modifier
                        .height(32.dp)
                        .border(1.dp, ZenithBorder, RoundedCornerShape(8.dp))
                ) {
                    Text(
                        text = if (healthSnapshot.isConnected) "ACTIEF" else "KOPPELEN",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (healthSnapshot.isConnected) ZenithPrimary else ZenithTextPrimary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 2. Weight History List
        Text(
            text = "GEWICHTSHISTORIE (${weights.size})",
            fontSize = 11.sp,
            fontWeight = FontWeight.ExtraBold,
            color = ZenithSecondary,
            letterSpacing = 1.sp
        )

        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (weights.isEmpty()) {
                item {
                    Text(
                        text = "Nog geen wegingen gelogd. Klik op + Log Gewicht om te beginnen.",
                        fontSize = 11.sp,
                        color = ZenithSecondary,
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                }
            } else {
                itemsIndexed(weights) { index, log ->
                    val prevLog = weights.getOrNull(index + 1)
                    val delta = if (prevLog != null) log.weightKg - prevLog.weightKg else null

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ZenithCardBg, RoundedCornerShape(12.dp))
                            .border(1.dp, ZenithBorder, RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "${log.weightKg} kg",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                color = ZenithTextPrimary
                            )
                            val fatStr = log.bodyFatPct?.let { " • Vet: $it%" } ?: ""
                            Text(
                                text = "${log.date}$fatStr",
                                fontSize = 10.sp,
                                color = ZenithSecondary
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (delta != null) {
                                val deltaStr = if (delta > 0) "+${Math.round(delta * 10) / 10.0}" else "${Math.round(delta * 10) / 10.0}"
                                val deltaColor = if (delta <= 0) ZenithPrimary else ZenithAccentOrange
                                Text(
                                    text = "$deltaStr kg",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = deltaColor,
                                    modifier = Modifier.padding(end = 12.dp)
                                )
                            }

                            IconButton(
                                onClick = { onDeleteWeight(log.id) },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Text("✕", fontSize = 12.sp, color = ZenithError, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }

    // Weight Log Modal Dialog
    if (showLogModal) {
        AlertDialog(
            onDismissRequest = { showLogModal = false },
            containerColor = ZenithCardBg,
            title = { Text("Gewicht Invoeren", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = weightInput,
                        onValueChange = { weightInput = it },
                        label = { Text("Gewicht in kg (bijv. 81.4)*", color = ZenithSecondary) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = bodyFatInput,
                        onValueChange = { bodyFatInput = it },
                        label = { Text("Vetpercentage % (Optioneel)", color = ZenithSecondary) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val w = weightInput.toDoubleOrNull()
                        if (w != null && w > 0) {
                            val fat = bodyFatInput.toDoubleOrNull()
                            onSaveWeight(w, fat)
                            showLogModal = false
                            weightInput = ""
                            bodyFatInput = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground)
                ) {
                    Text("OPSLAAN", fontWeight = FontWeight.ExtraBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogModal = false }) {
                    Text("ANNULEER", color = ZenithSecondary)
                }
            }
        )
    }
}
