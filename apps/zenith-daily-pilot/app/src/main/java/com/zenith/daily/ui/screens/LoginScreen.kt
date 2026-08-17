package com.zenith.daily.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.daily.data.SupabaseClient
import com.zenith.daily.ui.theme.*
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (email: String) -> Unit,
    onSkipLogin: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var emailInput by remember { mutableStateOf("") }
    var passwordInput by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoggingIn by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZenithBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "ZENITH",
                fontSize = 36.sp,
                fontWeight = FontWeight.Black,
                color = ZenithTextPrimary,
                letterSpacing = 4.sp
            )
            Text(
                text = "DAILY NUTRITION & HEALTH",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ZenithPrimary,
                letterSpacing = 2.sp,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            Card(
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ZenithBorder, RoundedCornerShape(20.dp))
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "Zenith Ecosysteem Login",
                        color = ZenithTextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Sign in with the same account as Zenith Hub on desktop to sync data live.",
                        color = ZenithSecondary,
                        fontSize = 11.sp,
                        lineHeight = 15.sp
                    )

                    OutlinedTextField(
                        value = emailInput,
                        onValueChange = { emailInput = it; errorMessage = null },
                        label = { Text("E-mailadres", color = ZenithSecondary) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = passwordInput,
                        onValueChange = { passwordInput = it; errorMessage = null },
                        label = { Text("Wachtwoord", color = ZenithSecondary) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    errorMessage?.let { err ->
                        Text(
                            text = err,
                            color = ZenithError,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Button(
                        onClick = {
                            if (emailInput.isBlank() || passwordInput.isBlank()) {
                                errorMessage = "Please enter both your email address and password."
                                return@Button
                            }
                            isLoggingIn = true
                            scope.launch {
                                try {
                                    SupabaseClient.client.auth.signInWith(Email) {
                                        email = emailInput.trim()
                                        password = passwordInput
                                    }
                                    onLoginSuccess(emailInput.trim())
                                } catch (e: Exception) {
                                    errorMessage = "Inloggen mislukt: ${e.localizedMessage ?: "Controleer je gegevens"}"
                                } finally {
                                    isLoggingIn = false
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        enabled = !isLoggingIn
                    ) {
                        if (isLoggingIn) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = ZenithBackground,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                text = "SIGN IN WITH ZENITH",
                                color = ZenithBackground,
                                fontWeight = FontWeight.Black,
                                fontSize = 13.sp,
                                letterSpacing = 1.sp
                            )
                        }
                    }

                    TextButton(
                        onClick = onSkipLogin,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "USE OFFLINE / GUEST MODE",
                            color = ZenithSecondary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            }
        }
    }
}
