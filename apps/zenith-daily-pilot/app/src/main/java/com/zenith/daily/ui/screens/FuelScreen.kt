package com.zenith.daily.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.zenith.daily.data.DailyMealLog
import com.zenith.daily.data.FoodItem
import com.zenith.daily.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FuelScreen(
    todayMeals: List<DailyMealLog>,
    foodItems: List<FoodItem>,
    onAddMealLog: (mealType: String, foodName: String, calories: Int, proteinG: Double, carbsG: Double, fatG: Double, servings: Double) -> Unit,
    onDeleteMealLog: (id: String) -> Unit,
    onAddCustomFood: (name: String, brand: String?, servingSize: String, calories: Int, proteinG: Double, carbsG: Double, fatG: Double, barcode: String?) -> Unit,
    onSearchBarcode: suspend (barcode: String) -> FoodItem?,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()

    var showSearchModal by remember { mutableStateOf(false) }
    var selectedMealType by remember { mutableStateOf("Lunch") }
    var searchQuery by remember { mutableStateOf("") }
    
    var showCustomFoodModal by remember { mutableStateOf(false) }
    var showBarcodeModal by remember { mutableStateOf(false) }
    var barcodeInput by remember { mutableStateOf("") }
    var barcodeLookupError by remember { mutableStateOf<String?>(null) }
    var isBarcodeSearching by remember { mutableStateOf(false) }

    val filteredFoodItems = foodItems.filter {
        it.name.contains(searchQuery, ignoreCase = true) || (it.brand?.contains(searchQuery, ignoreCase = true) == true)
    }

    val mealCategories = listOf("Ontbijt", "Lunch", "Diner", "Snacks")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ZenithBackground)
            .padding(horizontal = 18.dp)
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        // Header Actions Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "ZENITH FUEL",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    color = ZenithTextPrimary
                )
                Text(
                    text = "Nutritions- & Maaltijdenlog",
                    fontSize = 11.sp,
                    color = ZenithSecondary
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { showBarcodeModal = true },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithSurface),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier
                        .height(36.dp)
                        .border(1.dp, ZenithBorder, RoundedCornerShape(10.dp))
                ) {
                    Text("📷 BARCODE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithAccentBlue)
                }

                Button(
                    onClick = { showCustomFoodModal = true },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithSurface),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier
                        .height(36.dp)
                        .border(1.dp, ZenithBorder, RoundedCornerShape(10.dp))
                ) {
                    Text("＋ PRODUCT", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithPrimary)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Meal Categories List
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(mealCategories) { category ->
                val categoryMeals = todayMeals.filter { it.mealType.equals(category, ignoreCase = true) }
                val categoryCals = categoryMeals.sumOf { it.calories }

                Card(
                    colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ZenithBorder, RoundedCornerShape(16.dp))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = category.uppercase(),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    color = ZenithTextPrimary,
                                    letterSpacing = 1.sp
                                )
                                Text(
                                    text = "$categoryCals kcal",
                                    fontSize = 11.sp,
                                    color = ZenithPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Button(
                                onClick = {
                                    selectedMealType = category
                                    showSearchModal = true
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = ZenithSurface),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier
                                    .height(32.dp)
                                    .border(1.dp, ZenithBorder, RoundedCornerShape(8.dp))
                            ) {
                                Text("＋ ADD", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = ZenithTextPrimary)
                            }
                        }

                        if (categoryMeals.isEmpty()) {
                            Text(
                                text = "No $category logged",
                                fontSize = 11.sp,
                                color = ZenithSecondary,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        } else {
                            categoryMeals.forEach { meal ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(ZenithSurface, RoundedCornerShape(8.dp))
                                        .padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = meal.foodName,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = ZenithTextPrimary
                                        )
                                        Text(
                                            text = "${meal.calories} kcal • E: ${meal.proteinG}g • C: ${meal.carbsG}g • V: ${meal.fatG}g",
                                            fontSize = 10.sp,
                                            color = ZenithSecondary
                                        )
                                    }

                                    IconButton(
                                        onClick = { onDeleteMealLog(meal.id) },
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
        }
    }

    // 1. Food Items Search & Add Modal
    if (showSearchModal) {
        AlertDialog(
            onDismissRequest = { showSearchModal = false },
            containerColor = ZenithCardBg,
            title = {
                Text("Add meal to $selectedMealType", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary)
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        label = { Text("Zoek product...", color = ZenithSecondary) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(250.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredFoodItems) { food ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(ZenithSurface, RoundedCornerShape(8.dp))
                                    .clickable {
                                        onAddMealLog(selectedMealType, food.name, food.calories, food.proteinG, food.carbsG, food.fatG, 1.0)
                                        showSearchModal = false
                                    }
                                    .padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(food.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary)
                                    val brandStr = food.brand?.let { " ($it)" } ?: ""
                                    Text("${food.servingSize}$brandStr • ${food.calories} kcal", fontSize = 10.sp, color = ZenithSecondary)
                                    Text("E: ${food.proteinG}g • C: ${food.carbsG}g • V: ${food.fatG}g", fontSize = 9.sp, color = ZenithPrimary)
                                }
                                Text("＋", fontSize = 18.sp, color = ZenithPrimary, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showSearchModal = false }) {
                    Text("SLUITEN", color = ZenithSecondary)
                }
            }
        )
    }

    // 2. Barcode Lookup Modal
    if (showBarcodeModal) {
        AlertDialog(
            onDismissRequest = { showBarcodeModal = false },
            containerColor = ZenithCardBg,
            title = { Text("Barcode / QR Code Scannen", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Voer de 13-cijferige EAN/Barcode in of gebruik de camera scanner:", fontSize = 11.sp, color = ZenithSecondary)
                    OutlinedTextField(
                        value = barcodeInput,
                        onValueChange = { barcodeInput = it },
                        label = { Text("Barcode (bijv. 8710400000000)", color = ZenithSecondary) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = ZenithTextPrimary,
                            unfocusedTextColor = ZenithTextPrimary,
                            focusedBorderColor = ZenithPrimary,
                            unfocusedBorderColor = ZenithBorder
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (isBarcodeSearching) {
                        CircularProgressIndicator(color = ZenithPrimary, modifier = Modifier.size(24.dp))
                    }

                    barcodeLookupError?.let { err ->
                        Text(err, fontSize = 11.sp, color = ZenithError, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (barcodeInput.isNotBlank()) {
                            isBarcodeSearching = true
                            barcodeLookupError = null
                            scope.launch {
                                val item = onSearchBarcode(barcodeInput.trim())
                                isBarcodeSearching = false
                                if (item != null) {
                                    onAddMealLog("Lunch", item.name, item.calories, item.proteinG, item.carbsG, item.fatG, 1.0)
                                    showBarcodeModal = false
                                    barcodeInput = ""
                                } else {
                                    barcodeLookupError = "Product not found in OpenFoodFacts or local database."
                                }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground)
                ) {
                    Text("ZOEK & LOG", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showBarcodeModal = false }) {
                    Text("ANNULEER", color = ZenithSecondary)
                }
            }
        )
    }

    // 3. Custom Food Creation Modal
    if (showCustomFoodModal) {
        var nameInput by remember { mutableStateOf("") }
        var brandInput by remember { mutableStateOf("") }
        var servingInput by remember { mutableStateOf("100g") }
        var calsInput by remember { mutableStateOf("") }
        var proteinInput by remember { mutableStateOf("") }
        var carbsInput by remember { mutableStateOf("") }
        var fatInput by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showCustomFoodModal = false },
            containerColor = ZenithCardBg,
            title = { Text("Nieuw Ingrediënt / Product", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = nameInput,
                        onValueChange = { nameInput = it },
                        label = { Text("Productnaam*", color = ZenithSecondary) },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = brandInput,
                            onValueChange = { brandInput = it },
                            label = { Text("Merk", color = ZenithSecondary) },
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = servingInput,
                            onValueChange = { servingInput = it },
                            label = { Text("Portie (bijv 100g)", color = ZenithSecondary) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = calsInput,
                            onValueChange = { calsInput = it },
                            label = { Text("Calorieën*", color = ZenithSecondary) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = proteinInput,
                            onValueChange = { proteinInput = it },
                            label = { Text("Eiwit (g)*", color = ZenithSecondary) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = carbsInput,
                            onValueChange = { carbsInput = it },
                            label = { Text("Koolh. (g)", color = ZenithSecondary) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = fatInput,
                            onValueChange = { fatInput = it },
                            label = { Text("Vet (g)", color = ZenithSecondary) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val cals = calsInput.toIntOrNull()
                        val prot = proteinInput.toDoubleOrNull()
                        if (nameInput.isNotBlank() && cals != null && prot != null) {
                            onAddCustomFood(
                                nameInput.trim(),
                                brandInput.ifBlank { null },
                                servingInput.ifBlank { "100g" },
                                cals,
                                prot,
                                carbsInput.toDoubleOrNull() ?: 0.0,
                                fatInput.toDoubleOrNull() ?: 0.0,
                                null
                            )
                            showCustomFoodModal = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground)
                ) {
                    Text("SAVE", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCustomFoodModal = false }) {
                    Text("ANNULEER", color = ZenithSecondary)
                }
            }
        )
    }
}
