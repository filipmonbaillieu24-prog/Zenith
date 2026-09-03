package com.zenith.kratos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.zenith.kratos.data.SupabaseClient
import com.zenith.kratos.ui.theme.*
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var emailInput by remember { mutableStateOf("") }
    var passwordInput by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoggingIn by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZenithScreenBrush)
            .then(safeDrawingPadding()),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // The wordmark carries the whole screen, so it is set large and light
            // rather than heavy - a black serif at this size reads as a logo stamp.
            Text(
                text = "KRATOS",
                fontSize = 52.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = KratosWordmark,
                color = Color.White,
                letterSpacing = 2.sp
            )
            Text(
                text = "STRENGTH & CONDITIONING",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ZenithPrimary,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(bottom = 36.dp)
            )

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedTextField(
                    value = emailInput,
                    onValueChange = { emailInput = it; errorMessage = null },
                    placeholder = { Text("Email address", color = ZenithSecondary, fontSize = 13.sp) },
                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithBorder,
                        cursorColor = ZenithAccent,
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = passwordInput,
                    onValueChange = { passwordInput = it; errorMessage = null },
                    placeholder = { Text("Password", color = ZenithSecondary, fontSize = 13.sp) },
                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithBorder,
                        cursorColor = ZenithAccent,
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = ZenithError,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Button(
                    onClick = {
                        if (emailInput.isBlank() || passwordInput.isBlank()) {
                            errorMessage = "Please fill in all fields."
                            return@Button
                        }
                        isLoggingIn = true
                        scope.launch {
                            try {
                                SupabaseClient.client.auth.signInWith(Email) {
                                    email = emailInput
                                    password = passwordInput
                                }
                                onLoginSuccess()
                            } catch (e: Exception) {
                                errorMessage = "Login failed: ${e.localizedMessage ?: "Verify credentials"}"
                            } finally {
                                isLoggingIn = false
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithLoginAccent),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = !isLoggingIn
                ) {
                    if (isLoggingIn) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = ZenithOnAccent,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "LOG IN",
                            color = ZenithOnAccent,
                            fontWeight = FontWeight.Black,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }
    }
}
