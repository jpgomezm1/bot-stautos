const { InventoryPopulator } = require('./populateInventory');
const { InventoryService } = require('../services/inventoryService');

async function testInventoryFlow() {
  console.log('🧪 PRUEBA COMPLETA DEL SISTEMA DE INVENTARIO');
  console.log('=' .repeat(60));
  
  try {
    // 1. Mostrar inventario actual
    console.log('1️⃣ Verificando inventario actual...');
    const populator = new InventoryPopulator();
    const currentInventory = await populator.showCurrentInventory();
    
    if (currentInventory.success && currentInventory.total > 0) {
      console.log(`✅ Inventario actual: ${currentInventory.total} vehículos`);
    } else {
      console.log('📭 Inventario vacío - poblando con datos mock...');
      await populator.populateInventory({ numVehicles: 60 });
    }
    
    // 2. Probar servicio de inventario
    console.log('\n2️⃣ Probando servicio de inventario...');
    const inventoryService = new InventoryService();
    const serviceTest = await inventoryService.testConnection();
    
    if (serviceTest.success) {
      console.log('✅ Servicio de inventario funcionando:', {
        totalVehiculos: serviceTest.totalVehicles,
        marcasDisponibles: serviceTest.brands.length,
        primerMarca: serviceTest.brands[0]
      });
    } else {
      console.log('❌ Error en servicio de inventario:', serviceTest.error);
      return;
    }
    
    // 3. Probar búsquedas
    console.log('\n3️⃣ Probando búsquedas...');
    
    // Búsqueda por marca
    const toyotaSearch = await inventoryService.searchVehicles({ marca: 'Toyota' });
    console.log(`🔍 Búsqueda Toyota: ${toyotaSearch.vehicles.length} vehículos encontrados`);
    if (toyotaSearch.vehicles.length > 0) {
      console.log(`   Ejemplo: ${toyotaSearch.vehicles[0].Referencia_Vehiculo} - ${toyotaSearch.vehicles[0].Modelo}`);
    }
    
    // Búsqueda por kilómetros
    const lowKmSearch = await inventoryService.searchVehicles({ kmMax: 50000 });
    console.log(`🔍 Búsqueda < 50K km: ${lowKmSearch.vehicles.length} vehículos encontrados`);
    
    // 4. Obtener inventario completo
    console.log('\n4️⃣ Obteniendo inventario completo...');
    const fullInventory = await inventoryService.getInventory();
    
    if (fullInventory.success) {
      console.log('✅ Inventario completo obtenido:', {
        totalVehiculos: fullInventory.vehicles.length,
        marcas: fullInventory.brands,
        ultimaActualizacion: fullInventory.lastUpdate
      });
      
      // Mostrar distribución por marca
      const marcaCount = {};
      fullInventory.vehicles.forEach(v => {
        marcaCount[v.Marca] = (marcaCount[v.Marca] || 0) + 1;
      });
      
      console.log('\n📊 Distribución por marca:');
      Object.entries(marcaCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .forEach(([marca, count]) => {
          console.log(`   ${marca}: ${count} vehículos`);
        });
        
      // Mostrar ejemplos de referencias
      console.log('\n🔗 Referencias de ejemplo para el bot:');
      fullInventory.vehicles.slice(0, 8).forEach(v => {
        console.log(`   ${v.Referencia_Vehiculo}: ${v.Marca} ${v.Modelo} (${v.KM} km)`);
      });
    }
    
    // 5. Probar búsqueda por referencia
    console.log('\n5️⃣ Probando búsqueda por referencia...');
    if (fullInventory.vehicles.length > 0) {
      const testRef = fullInventory.vehicles[0].Referencia_Vehiculo;
      const vehicleByRef = await inventoryService.getVehicleByReference(testRef);
      
      if (vehicleByRef) {
        console.log(`✅ Vehículo encontrado por referencia ${testRef}:`, {
          marca: vehicleByRef.Marca,
          modelo: vehicleByRef.Modelo,
          km: vehicleByRef.KM
        });
      }
    }
    
    console.log('\n🎉 ¡TODAS LAS PRUEBAS EXITOSAS!');
    console.log('\n💡 FRASES DE PRUEBA PARA EL BOT:');
    console.log('   "Estoy buscando un Toyota"');
    console.log('   "¿Qué SUV tienen disponibles?"');
    console.log('   "Quiero ver vehículos con menos de 50 mil kilómetros"');
    console.log(`   "Me interesa la referencia ${fullInventory.vehicles[0]?.Referencia_Vehiculo}"`);
    console.log('   "¿Tienen Chevrolet Spark?"');
    console.log('   "Mi presupuesto es de 40 millones"');
    
  } catch (error) {
    console.error('\n❌ ERROR EN LA PRUEBA:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testInventoryFlow();
}

module.exports = { testInventoryFlow };