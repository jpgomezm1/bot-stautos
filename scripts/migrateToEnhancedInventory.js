const { EnhancedInventoryPopulator } = require('./populateEnhancedInventory');
const { InventoryService } = require('../services/inventoryService');

async function migrateToEnhancedInventory() {
  console.log('🔄 MIGRACIÓN A INVENTARIO MEJORADO');
  console.log('=' .repeat(50));
  
  try {
    // 1. Verificar inventario actual
    console.log('1️⃣ Verificando inventario actual...');
    const inventoryService = new InventoryService();
    const currentInventory = await inventoryService.getInventory();
    
    if (currentInventory.success && currentInventory.vehicles.length > 0) {
      console.log(`📋 Inventario actual: ${currentInventory.vehicles.length} vehículos`);
      console.log(`📊 Campos actuales: ${Object.keys(currentInventory.vehicles[0]).join(', ')}`);
    }
    
    // 2. Crear inventario mejorado
    console.log('\n2️⃣ Creando inventario mejorado...');
    const populator = new EnhancedInventoryPopulator();
    
    const result = await populator.populateEnhancedInventory({
      clearExisting: true,
      addHeaders: true,
      numVehicles: 80
    });
    
    if (result.success) {
      console.log('✅ Migración completada exitosamente');
      console.log(`📈 Vehículos creados: ${result.totalVehicles}`);
      console.log(`🏷️ Marcas disponibles: ${result.brands.length}`);
      console.log(`🚗 Tipos disponibles: ${result.types.length}`);
      
      // 3. Verificar nueva estructura
      console.log('\n3️⃣ Verificando nueva estructura...');
      const newInventory = await inventoryService.forceUpdate();
      
      if (newInventory.success) {
        console.log(`✅ Nueva estructura verificada`);
        console.log(`📋 Campos nuevos: ${Object.keys(newInventory.vehicles[0]).join(', ')}`);
        console.log(`📊 Estadísticas de precios:`);
        console.log(`   Rango: $${result.priceStats.min.toLocaleString('es-CO')} - $${result.priceStats.max.toLocaleString('es-CO')}`);
        console.log(`   Promedio: $${Math.round(result.priceStats.avg).toLocaleString('es-CO')}`);
      }
      
      console.log('\n🎉 ¡MIGRACIÓN EXITOSA!');
      console.log('\n💡 AHORA EL BOT PUEDE USAR:');
      console.log('   • Información completa de precios');
      console.log('   • Años y tipos de vehículos');
      console.log('   • Colores y transmisiones');
      console.log('   • Descripciones detalladas');
      console.log('   • Ubicaciones específicas');
      console.log('   • Cilindraje y combustible');
      
    } else {
      console.log('❌ Error en la migración:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migrateToEnhancedInventory();
}

module.exports = { migrateToEnhancedInventory };