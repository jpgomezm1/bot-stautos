const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

class EnhancedInventoryPopulator {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = '1Ra62fdHBIZFTDkA6suQcoy987qHo92O4ib84-aBkePA';
    this.sheetName = null;
    this.range = null;
  }

  async initialize() {
    try {
      const credentialsPath = path.join(__dirname, '../creds.json');
      
      this.auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      console.log('✅ Enhanced Inventory Service inicializado correctamente');
      
      await this.discoverSheetStructure();
      
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Enhanced Inventory Service:', error.message);
      return false;
    }
  }

  async discoverSheetStructure() {
    try {
      console.log('🔍 Descubriendo estructura del spreadsheet...');
      
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheets = response.data.sheets;
      
      if (sheets && sheets.length > 0) {
        this.sheetName = sheets[0].properties.title;
        this.range = `${this.sheetName}!A:N`; // Expandido para más columnas
        
        console.log(`📋 Hoja encontrada: "${this.sheetName}"`);
        console.log(`📊 Total hojas en spreadsheet: ${sheets.length}`);
        
        return true;
      } else {
        throw new Error('No se encontraron hojas en el spreadsheet');
      }
    } catch (error) {
      console.error('❌ Error descubriendo estructura:', error.message);
      
      // Fallback
      const commonNames = ['Hoja 1', 'Hoja1', 'Sheet1', 'Inventario', 'Vehiculos'];
      
      for (const name of commonNames) {
        try {
          this.sheetName = name;
          this.range = `${name}!A:N`;
          
          await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${name}!A1:N1`,
          });
          
          console.log(`✅ Hoja encontrada con nombre: "${name}"`);
          return true;
        } catch (e) {
          console.log(`❌ "${name}" no funciona`);
        }
      }
      
      throw error;
    }
  }

  generateEnhancedMockVehicles() {
    const marcas = [
      'Toyota', 'Chevrolet', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 
      'Volkswagen', 'Ford', 'Honda', 'Suzuki', 'Mitsubishi', 'Renault'
    ];
    
    const modelosPorMarca = {
      'Toyota': [
        { modelo: 'Corolla', tipo: 'Sedan', cilindraje: '1.8L' },
        { modelo: 'Prius', tipo: 'Híbrido', cilindraje: '1.8L' },
        { modelo: 'RAV4', tipo: 'SUV', cilindraje: '2.5L' },
        { modelo: 'Hilux', tipo: 'Pickup', cilindraje: '2.4L' },
        { modelo: 'Yaris', tipo: 'Hatchback', cilindraje: '1.5L' },
        { modelo: 'Fortuner', tipo: 'SUV', cilindraje: '2.7L' },
        { modelo: 'Prado', tipo: 'SUV', cilindraje: '4.0L' }
      ],
      'Chevrolet': [
        { modelo: 'Spark', tipo: 'Hatchback', cilindraje: '1.4L' },
        { modelo: 'Onix', tipo: 'Sedan', cilindraje: '1.4L' },
        { modelo: 'Cruze', tipo: 'Sedan', cilindraje: '1.4L Turbo' },
        { modelo: 'Captiva', tipo: 'SUV', cilindraje: '2.4L' },
        { modelo: 'Tracker', tipo: 'SUV', cilindraje: '1.2L Turbo' },
        { modelo: 'Silverado', tipo: 'Pickup', cilindraje: '5.3L' }
      ],
      'Nissan': [
        { modelo: 'Versa', tipo: 'Sedan', cilindraje: '1.6L' },
        { modelo: 'Sentra', tipo: 'Sedan', cilindraje: '1.8L' },
        { modelo: 'X-Trail', tipo: 'SUV', cilindraje: '2.5L' },
        { modelo: 'Kicks', tipo: 'SUV', cilindraje: '1.6L' },
        { modelo: 'Frontier', tipo: 'Pickup', cilindraje: '2.5L' },
        { modelo: 'Pathfinder', tipo: 'SUV', cilindraje: '3.5L' }
      ],
      'Hyundai': [
        { modelo: 'Accent', tipo: 'Sedan', cilindraje: '1.4L' },
        { modelo: 'Elantra', tipo: 'Sedan', cilindraje: '2.0L' },
        { modelo: 'Tucson', tipo: 'SUV', cilindraje: '2.0L' },
        { modelo: 'Santa Fe', tipo: 'SUV', cilindraje: '2.4L' },
        { modelo: 'Creta', tipo: 'SUV', cilindraje: '1.6L' },
        { modelo: 'i10', tipo: 'Hatchback', cilindraje: '1.2L' }
      ],
      'Kia': [
        { modelo: 'Rio', tipo: 'Hatchback', cilindraje: '1.4L' },
        { modelo: 'Cerato', tipo: 'Sedan', cilindraje: '1.6L' },
        { modelo: 'Sportage', tipo: 'SUV', cilindraje: '2.0L' },
        { modelo: 'Sorento', tipo: 'SUV', cilindraje: '2.4L' },
        { modelo: 'Picanto', tipo: 'Hatchback', cilindraje: '1.0L' },
        { modelo: 'Stonic', tipo: 'SUV', cilindraje: '1.4L' }
      ],
      'Mazda': [
        { modelo: 'Mazda2', tipo: 'Hatchback', cilindraje: '1.5L' },
        { modelo: 'Mazda3', tipo: 'Sedan', cilindraje: '2.0L' },
        { modelo: 'CX-3', tipo: 'SUV', cilindraje: '2.0L' },
        { modelo: 'CX-5', tipo: 'SUV', cilindraje: '2.5L' },
        { modelo: 'BT-50', tipo: 'Pickup', cilindraje: '3.2L' }
      ],
      'Volkswagen': [
        { modelo: 'Gol', tipo: 'Hatchback', cilindraje: '1.6L' },
        { modelo: 'Polo', tipo: 'Hatchback', cilindraje: '1.6L' },
        { modelo: 'Jetta', tipo: 'Sedan', cilindraje: '1.4L Turbo' },
        { modelo: 'Tiguan', tipo: 'SUV', cilindraje: '1.4L Turbo' },
        { modelo: 'Amarok', tipo: 'Pickup', cilindraje: '2.0L Turbo' }
      ],
      'Ford': [
        { modelo: 'Fiesta', tipo: 'Hatchback', cilindraje: '1.6L' },
        { modelo: 'Focus', tipo: 'Hatchback', cilindraje: '2.0L' },
        { modelo: 'Escape', tipo: 'SUV', cilindraje: '1.5L Turbo' },
        { modelo: 'Explorer', tipo: 'SUV', cilindraje: '2.3L Turbo' },
        { modelo: 'Ranger', tipo: 'Pickup', cilindraje: '2.3L Turbo' },
        { modelo: 'EcoSport', tipo: 'SUV', cilindraje: '1.5L' }
      ],
      'Honda': [
        { modelo: 'Fit', tipo: 'Hatchback', cilindraje: '1.5L' },
        { modelo: 'Civic', tipo: 'Sedan', cilindraje: '1.5L Turbo' },
        { modelo: 'CR-V', tipo: 'SUV', cilindraje: '1.5L Turbo' },
        { modelo: 'HR-V', tipo: 'SUV', cilindraje: '1.8L' },
        { modelo: 'Pilot', tipo: 'SUV', cilindraje: '3.5L' }
      ],
      'Suzuki': [
        { modelo: 'Alto', tipo: 'Hatchback', cilindraje: '1.0L' },
        { modelo: 'Swift', tipo: 'Hatchback', cilindraje: '1.2L' },
        { modelo: 'Vitara', tipo: 'SUV', cilindraje: '1.6L' },
        { modelo: 'Jimny', tipo: 'SUV', cilindraje: '1.5L' }
      ],
      'Mitsubishi': [
        { modelo: 'Mirage', tipo: 'Hatchback', cilindraje: '1.2L' },
        { modelo: 'Outlander', tipo: 'SUV', cilindraje: '2.4L' },
        { modelo: 'L200', tipo: 'Pickup', cilindraje: '2.4L' },
        { modelo: 'ASX', tipo: 'SUV', cilindraje: '2.0L' }
      ],
      'Renault': [
        { modelo: 'Logan', tipo: 'Sedan', cilindraje: '1.6L' },
        { modelo: 'Sandero', tipo: 'Hatchback', cilindraje: '1.6L' },
        { modelo: 'Duster', tipo: 'SUV', cilindraje: '2.0L' },
        { modelo: 'Koleos', tipo: 'SUV', cilindraje: '2.5L' },
        { modelo: 'Captur', tipo: 'SUV', cilindraje: '1.6L' }
      ]
    };

    const colores = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul', 'Dorado', 'Verde'];
    const transmisiones = ['Manual', 'Automática', 'CVT'];
    const combustibles = ['Gasolina', 'Diesel', 'Híbrido'];
    const condiciones = ['Excelente', 'Muy Bueno', 'Bueno'];

    const vehicles = [];
    let counter = 1;

    marcas.forEach(marca => {
      const modelosData = modelosPorMarca[marca];
      const numVehiculos = Math.floor(Math.random() * 6) + 3; // Entre 3 y 8 vehículos por marca
      
      for (let i = 0; i < numVehiculos && counter <= 100; i++) {
        const modeloData = modelosData[Math.floor(Math.random() * modelosData.length)];
        const year = 2015 + Math.floor(Math.random() * 9); // Años 2015-2023
        const kmBase = Math.floor(Math.random() * 150000) + 10000; // Entre 10K y 160K km
        const km = Math.round(kmBase / 1000) * 1000; // Redondear a miles
        
        const precioBase = this.calculatePrice(marca, modeloData.tipo, year, km);
        const precio = Math.round(precioBase / 100000) * 100000; // Redondear a 100k
        
        const referencia = `VEH${counter.toString().padStart(3, '0')}`;
        
        vehicles.push({
          Referencia_Vehiculo: referencia,
          Marca: marca,
          Modelo: modeloData.modelo,
          Año: year,
          Kilometraje: km.toLocaleString('es-CO'),
          Tipo_Vehiculo: modeloData.tipo,
          Cilindraje: modeloData.cilindraje,
          Transmision: transmisiones[Math.floor(Math.random() * transmisiones.length)],
          Combustible: combustibles[Math.floor(Math.random() * combustibles.length)],
          Color: colores[Math.floor(Math.random() * colores.length)],
          Precio: precio.toLocaleString('es-CO'),
          Estado: condiciones[Math.floor(Math.random() * condiciones.length)],
          Descripcion: this.generateDescription(marca, modeloData.modelo, modeloData.tipo, year),
          Ubicacion: this.getRandomLocation()
        });
        
        counter++;
      }
    });

    return this.shuffleArray(vehicles);
  }

  calculatePrice(marca, tipo, year, km) {
    // Precios base por marca (en millones)
    const preciosBaseMarca = {
      'Toyota': 45, 'Honda': 42, 'Mazda': 38, 'Nissan': 35,
      'Hyundai': 32, 'Kia': 30, 'Chevrolet': 28, 'Ford': 26,
      'Volkswagen': 40, 'Renault': 25, 'Suzuki': 22, 'Mitsubishi': 24
    };

    // Multiplicadores por tipo
    const multiplicadoresTipo = {
      'SUV': 1.4, 'Pickup': 1.3, 'Sedan': 1.0, 'Hatchback': 0.8, 'Híbrido': 1.2
    };

    const precioBase = preciosBaseMarca[marca] || 30;
    const multiplicadorTipo = multiplicadoresTipo[tipo] || 1.0;
    
    // Depreciación por año (5% anual)
    const yearsOld = 2024 - year;
    const depreciacion = Math.pow(0.95, yearsOld);
    
    // Depreciación por kilómetros (más km = menor precio)
    const depreciacionKm = Math.max(0.6, 1 - (km / 300000));
    
    const precioFinal = precioBase * multiplicadorTipo * depreciacion * depreciacionKm * 1000000;
    
    return Math.max(15000000, precioFinal); // Mínimo 15 millones
  }

  generateDescription(marca, modelo, tipo, year) {
    const descripciones = [
      `${marca} ${modelo} ${year} en excelente estado. Perfecto para uso familiar.`,
      `Hermoso ${marca} ${modelo} ${year}, muy cuidado y con mantenimiento al día.`,
      `${tipo} ${marca} ${modelo} ${year} en perfectas condiciones, único dueño.`,
      `Espectacular ${marca} ${modelo} ${year}, ideal para ciudad y carretera.`,
      `${marca} ${modelo} ${year} impecable, con todos los papeles en regla.`,
      `Oportunidad única: ${marca} ${modelo} ${year} en excelente estado.`
    ];

    return descripciones[Math.floor(Math.random() * descripciones.length)];
  }

  getRandomLocation() {
    const ubicaciones = [
      'Medellín - Zona Norte',
      'Medellín - Zona Sur', 
      'Medellín - Centro',
      'Bello',
      'Itagüí',
      'Envigado',
      'Sabaneta',
      'La Estrella'
    ];

    return ubicaciones[Math.floor(Math.random() * ubicaciones.length)];
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async clearSheet() {
    try {
      console.log(`🧹 Limpiando datos existentes en "${this.sheetName}"...`);
      
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });
      
      console.log('✅ Datos existentes eliminados');
      return true;
    } catch (error) {
      console.error('❌ Error limpiando sheet:', error.message);
      return false;
    }
  }

  async addEnhancedHeaders() {
    try {
      console.log('📋 Agregando headers mejorados...');
      
      const headers = [[
        'Referencia_Vehiculo',
        'Marca', 
        'Modelo',
        'Año',
        'Kilometraje',
        'Tipo_Vehiculo',
        'Cilindraje',
        'Transmision',
        'Combustible',
        'Color',
        'Precio',
        'Estado',
        'Descripcion',
        'Ubicacion'
      ]];
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:N1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: headers,
        },
      });
      
      console.log('✅ Headers mejorados agregados');
      return true;
    } catch (error) {
      console.error('❌ Error agregando headers mejorados:', error.message);
      return false;
    }
  }

  async addEnhancedVehicles(vehicles) {
    try {
      console.log(`🚗 Agregando ${vehicles.length} vehículos mejorados a "${this.sheetName}"...`);
      
      const values = vehicles.map(vehicle => [
        vehicle.Referencia_Vehiculo,
        vehicle.Marca,
        vehicle.Modelo,
        vehicle.Año,
        vehicle.Kilometraje,
        vehicle.Tipo_Vehiculo,
        vehicle.Cilindraje,
        vehicle.Transmision,
        vehicle.Combustible,
        vehicle.Color,
        vehicle.Precio,
        vehicle.Estado,
        vehicle.Descripcion,
        vehicle.Ubicacion
      ]);
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: values,
        },
      });
      
      console.log('✅ Vehículos mejorados agregados exitosamente');
      console.log(`📊 Filas actualizadas: ${response.data.updates.updatedRows}`);
      return true;
    } catch (error) {
      console.error('❌ Error agregando vehículos mejorados:', error.message);
      return false;
    }
  }

  async populateEnhancedInventory(options = {}) {
    const { 
      clearExisting = true, 
      addHeaders = true, 
      numVehicles = 80 
    } = options;

    try {
      console.log('🚀 INICIANDO POBLACIÓN DEL INVENTARIO MEJORADO');
      console.log('=' .repeat(60));
      
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('No se pudo inicializar Google Sheets');
      }

      console.log(`📋 Usando hoja: "${this.sheetName}"`);
      console.log(`📊 Rango expandido: ${this.range}`);

      if (clearExisting) {
        await this.clearSheet();
      }

      if (addHeaders) {
        await this.addEnhancedHeaders();
      }

      console.log('🎲 Generando datos mejorados...');
      let vehicles = this.generateEnhancedMockVehicles();
      
      if (numVehicles && numVehicles < vehicles.length) {
        vehicles = vehicles.slice(0, numVehicles);
      }

      await this.addEnhancedVehicles(vehicles);

      // Mostrar estadísticas mejoradas
      const marcasCount = {};
      const tiposCount = {};
      const precioStats = {
        min: Math.min(...vehicles.map(v => parseInt(v.Precio.replace(/[^\d]/g, '')))),
        max: Math.max(...vehicles.map(v => parseInt(v.Precio.replace(/[^\d]/g, '')))),
        avg: vehicles.reduce((sum, v) => sum + parseInt(v.Precio.replace(/[^\d]/g, '')), 0) / vehicles.length
      };

      vehicles.forEach(v => {
        marcasCount[v.Marca] = (marcasCount[v.Marca] || 0) + 1;
        tiposCount[v.Tipo_Vehiculo] = (tiposCount[v.Tipo_Vehiculo] || 0) + 1;
      });

      console.log('\n📊 ESTADÍSTICAS DEL INVENTARIO MEJORADO:');
      console.log('=' .repeat(60));
      console.log(`📈 Total vehículos: ${vehicles.length}`);
      console.log(`🏷️ Total marcas: ${Object.keys(marcasCount).length}`);
      console.log(`🚗 Total tipos: ${Object.keys(tiposCount).length}`);
      console.log(`📋 Hoja utilizada: "${this.sheetName}"`);
      
      console.log('\n💰 ESTADÍSTICAS DE PRECIOS:');
      console.log(`   Precio mínimo: $${precioStats.min.toLocaleString('es-CO')}`);
      console.log(`   Precio máximo: $${precioStats.max.toLocaleString('es-CO')}`);
      console.log(`   Precio promedio: $${Math.round(precioStats.avg).toLocaleString('es-CO')}`);
      
      console.log('\n🚗 Vehículos por marca:');
      Object.entries(marcasCount)
        .sort(([,a], [,b]) => b - a)
        .forEach(([marca, count]) => {
          console.log(`   ${marca}: ${count} vehículos`);
        });

      console.log('\n📋 Vehículos por tipo:');
      Object.entries(tiposCount)
        .sort(([,a], [,b]) => b - a)
        .forEach(([tipo, count]) => {
          console.log(`   ${tipo}: ${count} vehículos`);
        });

      console.log('\n🔗 EJEMPLOS DE VEHÍCULOS MEJORADOS:');
      console.log('=' .repeat(60));
      vehicles.slice(0, 10).forEach(v => {
        console.log(`📋 ${v.Referencia_Vehiculo}: ${v.Marca} ${v.Modelo} ${v.Año}`);
        console.log(`   💰 $${v.Precio} | 🏃 ${v.Kilometraje} km | ⚙️ ${v.Transmision} | 🎨 ${v.Color}`);
        console.log(`   📍 ${v.Ubicacion} | 📝 ${v.Descripcion.substring(0, 50)}...`);
        console.log('');
      });

      console.log('\n✅ INVENTARIO MEJORADO POBLADO EXITOSAMENTE');
      console.log(`🌐 Ver en: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
      console.log(`📝 Hoja: "${this.sheetName}"`);
      
      return {
        success: true,
        totalVehicles: vehicles.length,
        brands: Object.keys(marcasCount),
        types: Object.keys(tiposCount),
        vehicles: vehicles.slice(0, 5),
        sheetName: this.sheetName,
        priceStats: precioStats
      };

    } catch (error) {
      console.error('\n❌ ERROR POBLANDO INVENTARIO MEJORADO:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async showCurrentEnhancedInventory() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('No se pudo inicializar Google Sheets');
      }

      console.log('🔍 INVENTARIO ACTUAL MEJORADO:');
      console.log('=' .repeat(60));
      console.log(`📋 Hoja: "${this.sheetName}"`);
      console.log(`📊 Rango: ${this.range}`);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('📭 No hay vehículos en el inventario');
        return { success: true, vehicles: [], sheetName: this.sheetName };
      }

      const headers = rows[0];
      const vehicles = [];

      console.log(`📊 Total filas encontradas: ${rows.length - 1}`);
      console.log(`📋 Headers: ${headers.join(', ')}`);
      console.log('\n📋 Primeros 5 vehículos:');

      for (let i = 1; i < Math.min(rows.length, 6); i++) {
        const row = rows[i];
        if (row && row.length >= 14) {
          const vehicle = {
            Referencia_Vehiculo: row[0] || '',
            Marca: row[1] || '',
            Modelo: row[2] || '',
            Año: row[3] || '',
            Kilometraje: row[4] || '',
            Tipo_Vehiculo: row[5] || '',
            Cilindraje: row[6] || '',
            Transmision: row[7] || '',
            Combustible: row[8] || '',
            Color: row[9] || '',
            Precio: row[10] || '',
            Estado: row[11] || '',
            Descripcion: row[12] || '',
            Ubicacion: row[13] || ''
          };
          vehicles.push(vehicle);
          console.log(`   ${vehicle.Referencia_Vehiculo}: ${vehicle.Marca} ${vehicle.Modelo} ${vehicle.Año}`);
          console.log(`     💰 $${vehicle.Precio} | 🚗 ${vehicle.Tipo_Vehiculo} | 🎨 ${vehicle.Color} | 📍 ${vehicle.Ubicacion}`);
        }
      }

      return {
        success: true,
        total: rows.length - 1,
        vehicles: vehicles,
        sheetName: this.sheetName
      };

    } catch (error) {
      console.error('❌ Error obteniendo inventario actual mejorado:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Función principal para ejecutar desde línea de comandos
async function main() {
  const populator = new EnhancedInventoryPopulator();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'populate';
  
  switch (command) {
    case 'populate':
      const numVehicles = args[1] ? parseInt(args[1]) : 80;
      console.log(`🚗 Poblando inventario mejorado con ${numVehicles} vehículos...`);
      await populator.populateEnhancedInventory({ numVehicles });
      break;
      
    case 'show':
      await populator.showCurrentEnhancedInventory();
      break;
      
    case 'clear':
      const initialized = await populator.initialize();
      if (initialized) {
        await populator.clearSheet();
        console.log('✅ Inventario limpiado');
      }
      break;
      
    case 'headers':
      const init = await populator.initialize();
      if (init) {
        await populator.addEnhancedHeaders();
        console.log('✅ Headers mejorados agregados');
      }
      break;
      
    default:
      console.log('📋 COMANDOS DISPONIBLES:');
      console.log('  node scripts/populateEnhancedInventory.js populate [numero]  - Poblar con vehículos mejorados (default: 80)');
      console.log('  node scripts/populateEnhancedInventory.js show              - Mostrar inventario actual mejorado');
      console.log('  node scripts/populateEnhancedInventory.js clear             - Limpiar inventario');
      console.log('  node scripts/populateEnhancedInventory.js headers           - Solo agregar headers mejorados');
      console.log('');
      console.log('📝 EJEMPLOS:');
      console.log('  node scripts/populateEnhancedInventory.js populate 50      - Poblar con 50 vehículos');
      console.log('  node scripts/populateEnhancedInventory.js populate 100     - Poblar con 100 vehículos');
      console.log('');
      console.log('🆕 NUEVOS CAMPOS INCLUIDOS:');
      console.log('  • Año del vehículo');
      console.log('  • Cilindraje del motor');
     console.log('  • Tipo de transmisión');
     console.log('  • Tipo de combustible');
     console.log('  • Color del vehículo');
     console.log('  • Precio estimado');
     console.log('  • Estado/condición');
     console.log('  • Descripción detallada');
     console.log('  • Ubicación del vehículo');
 }
}

// Ejecutar si se llama directamente
if (require.main === module) {
 main().catch(console.error);
}

module.exports = { EnhancedInventoryPopulator };