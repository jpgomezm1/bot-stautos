const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

class InventoryPopulator {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = '1Ra62fdHBIZFTDkA6suQcoy987qHo92O4ib84-aBkePA';
    this.sheetName = null; // Lo determinaremos dinámicamente
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
      
      console.log('✅ Google Sheets inicializado correctamente');
      
      // Obtener información del spreadsheet para determinar el nombre de la hoja
      await this.discoverSheetStructure();
      
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Google Sheets:', error.message);
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
        // Usar la primera hoja disponible
        this.sheetName = sheets[0].properties.title;
        this.range = `${this.sheetName}!A:D`;
        
        console.log(`📋 Hoja encontrada: "${this.sheetName}"`);
        console.log(`📊 Total hojas en spreadsheet: ${sheets.length}`);
        
        // Mostrar todas las hojas disponibles
        console.log('📝 Hojas disponibles:');
        sheets.forEach((sheet, index) => {
          console.log(`   ${index + 1}. ${sheet.properties.title} (ID: ${sheet.properties.sheetId})`);
        });
        
        return true;
      } else {
        throw new Error('No se encontraron hojas en el spreadsheet');
      }
    } catch (error) {
      console.error('❌ Error descubriendo estructura:', error.message);
      
      // Fallback: intentar con nombres comunes
      console.log('🔄 Intentando con nombres de hoja comunes...');
      const commonNames = ['Hoja 1', 'Hoja1', 'Sheet1', 'Inventario', 'Vehiculos'];
      
      for (const name of commonNames) {
        try {
          this.sheetName = name;
          this.range = `${name}!A:D`;
          
          // Probar si funciona haciendo una consulta simple
          await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${name}!A1:D1`,
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

  generateMockVehicles() {
    const marcas = ['Toyota', 'Chevrolet', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Volkswagen', 'Ford', 'Honda', 'Suzuki', 'Mitsubishi', 'Renault'];
    
    const modelosPorMarca = {
      'Toyota': ['Corolla', 'Prius', 'Camry', 'RAV4', 'Highlander', 'Prado', 'Hilux', 'Yaris', 'Fortuner'],
      'Chevrolet': ['Spark', 'Onix', 'Cruze', 'Captiva', 'Tracker', 'Equinox', 'Tahoe', 'Silverado'],
      'Nissan': ['Versa', 'Sentra', 'Altima', 'X-Trail', 'Murano', 'Pathfinder', 'Frontier', 'Kicks'],
      'Hyundai': ['Accent', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Creta', 'i10', 'i20'],
      'Kia': ['Rio', 'Cerato', 'Optima', 'Sportage', 'Sorento', 'Picanto', 'Soul', 'Stonic'],
      'Mazda': ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-9', 'BT-50'],
      'Volkswagen': ['Gol', 'Polo', 'Jetta', 'Passat', 'Tiguan', 'Touareg', 'Amarok'],
      'Ford': ['Fiesta', 'Focus', 'Fusion', 'Escape', 'Explorer', 'F-150', 'Ranger', 'EcoSport'],
      'Honda': ['Fit', 'Civic', 'Accord', 'CR-V', 'Pilot', 'HR-V', 'Ridgeline'],
      'Suzuki': ['Alto', 'Swift', 'Baleno', 'Vitara', 'S-Cross', 'Jimny'],
      'Mitsubishi': ['Mirage', 'Lancer', 'Outlander', 'Montero', 'L200', 'ASX'],
      'Renault': ['Logan', 'Sandero', 'Fluence', 'Duster', 'Koleos', 'Captur', 'Oroch']
    };

    const vehicles = [];
    let counter = 1;

    marcas.forEach(marca => {
      const modelos = modelosPorMarca[marca];
      const numVehiculos = Math.floor(Math.random() * 6) + 3; // Entre 3 y 8 vehículos por marca
      
      for (let i = 0; i < numVehiculos && counter <= 100; i++) {
        const modelo = modelos[Math.floor(Math.random() * modelos.length)];
        const year = 2015 + Math.floor(Math.random() * 9); // Años 2015-2023
        const kmBase = Math.floor(Math.random() * 150000) + 10000; // Entre 10K y 160K km
        const km = Math.round(kmBase / 1000) * 1000; // Redondear a miles
        
        const referencia = `VEH${counter.toString().padStart(3, '0')}`;
        
        vehicles.push({
          Referencia_Vehiculo: referencia,
          Modelo: `${modelo} ${year}`,
          Marca: marca,
          KM: km.toLocaleString('es-CO')
        });
        
        counter++;
      }
    });

    return this.shuffleArray(vehicles);
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

  async addHeaders() {
    try {
      console.log('📋 Agregando headers...');
      
      const headers = [['Referencia_Vehiculo', 'Modelo', 'Marca', 'KM']];
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:D1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: headers,
        },
      });
      
      console.log('✅ Headers agregados');
      return true;
    } catch (error) {
      console.error('❌ Error agregando headers:', error.message);
      return false;
    }
  }

  async addVehicles(vehicles) {
    try {
      console.log(`🚗 Agregando ${vehicles.length} vehículos a "${this.sheetName}"...`);
      
      const values = vehicles.map(vehicle => [
        vehicle.Referencia_Vehiculo,
        vehicle.Modelo,
        vehicle.Marca,
        vehicle.KM
      ]);
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: values,
        },
      });
      
      console.log('✅ Vehículos agregados exitosamente');
      console.log(`📊 Filas actualizadas: ${response.data.updates.updatedRows}`);
      return true;
    } catch (error) {
      console.error('❌ Error agregando vehículos:', error.message);
      return false;
    }
  }

  async populateInventory(options = {}) {
    const { 
      clearExisting = true, 
      addHeaders = true, 
      numVehicles = 80 
    } = options;

    try {
      console.log('🚀 INICIANDO POBLACIÓN DEL INVENTARIO');
      console.log('=' .repeat(50));
      
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('No se pudo inicializar Google Sheets');
      }

      console.log(`📋 Usando hoja: "${this.sheetName}"`);
      console.log(`📊 Rango: ${this.range}`);

      if (clearExisting) {
        await this.clearSheet();
      }

      if (addHeaders) {
        await this.addHeaders();
      }

      console.log('🎲 Generando datos mock...');
      let vehicles = this.generateMockVehicles();
      
      if (numVehicles && numVehicles < vehicles.length) {
        vehicles = vehicles.slice(0, numVehicles);
      }

      await this.addVehicles(vehicles);

      // Mostrar estadísticas
      const marcasCount = {};
      vehicles.forEach(v => {
        marcasCount[v.Marca] = (marcasCount[v.Marca] || 0) + 1;
      });

      console.log('\n📊 ESTADÍSTICAS DEL INVENTARIO:');
      console.log('=' .repeat(50));
      console.log(`📈 Total vehículos: ${vehicles.length}`);
      console.log(`🏷️ Total marcas: ${Object.keys(marcasCount).length}`);
      console.log(`📋 Hoja utilizada: "${this.sheetName}"`);
      console.log('\n🚗 Vehículos por marca:');
      
      Object.entries(marcasCount)
        .sort(([,a], [,b]) => b - a)
        .forEach(([marca, count]) => {
          console.log(`   ${marca}: ${count} vehículos`);
        });

      console.log('\n🔗 EJEMPLOS DE VEHÍCULOS GENERADOS:');
      console.log('=' .repeat(50));
      vehicles.slice(0, 10).forEach(v => {
        console.log(`📋 ${v.Referencia_Vehiculo}: ${v.Marca} ${v.Modelo} - ${v.KM} km`);
      });

      console.log('\n✅ INVENTARIO POBLADO EXITOSAMENTE');
      console.log(`🌐 Ver en: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
      console.log(`📝 Hoja: "${this.sheetName}"`);
      
      return {
        success: true,
        totalVehicles: vehicles.length,
        brands: Object.keys(marcasCount),
        vehicles: vehicles.slice(0, 5),
        sheetName: this.sheetName
      };

    } catch (error) {
      console.error('\n❌ ERROR POBLANDO INVENTARIO:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async showCurrentInventory() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('No se pudo inicializar Google Sheets');
      }

      console.log('🔍 INVENTARIO ACTUAL:');
      console.log('=' .repeat(50));
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
      console.log('\n📋 Primeros 10 vehículos:');

      for (let i = 1; i < Math.min(rows.length, 11); i++) {
        const row = rows[i];
        if (row && row.length >= 4) {
          const vehicle = {
            Referencia_Vehiculo: row[0] || '',
            Modelo: row[1] || '',
            Marca: row[2] || '',
            KM: row[3] || ''
          };
          vehicles.push(vehicle);
          console.log(`   ${vehicle.Referencia_Vehiculo}: ${vehicle.Marca} ${vehicle.Modelo} - ${vehicle.KM} km`);
        }
      }

      // Estadísticas
      const marcasCount = {};
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row[2]) {
          marcasCount[row[2]] = (marcasCount[row[2]] || 0) + 1;
        }
      }

      console.log('\n🏷️ Marcas disponibles:');
      Object.entries(marcasCount)
        .sort(([,a], [,b]) => b - a)
        .forEach(([marca, count]) => {
          console.log(`   ${marca}: ${count} vehículos`);
        });

      return {
        success: true,
        total: rows.length - 1,
        vehicles: vehicles,
        brands: Object.keys(marcasCount),
        sheetName: this.sheetName
      };

    } catch (error) {
      console.error('❌ Error obteniendo inventario actual:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Método para crear una nueva hoja específica para inventario
  async createInventorySheet() {
    try {
      console.log('📝 Creando nueva hoja para inventario...');
      
      const requests = [{
        addSheet: {
          properties: {
            title: 'Inventario_Vehiculos'
          }
        }
      }];

      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: requests
        }
      });

      this.sheetName = 'Inventario_Vehiculos';
      this.range = `${this.sheetName}!A:D`;

      console.log('✅ Nueva hoja creada: "Inventario_Vehiculos"');
      return true;
    } catch (error) {
      console.error('❌ Error creando nueva hoja:', error.message);
      return false;
    }
  }
}

// Función principal para ejecutar desde línea de comandos
async function main() {
  const populator = new InventoryPopulator();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'populate';
  
  switch (command) {
    case 'populate':
      const numVehicles = args[1] ? parseInt(args[1]) : 80;
      console.log(`🚗 Poblando inventario con ${numVehicles} vehículos...`);
      await populator.populateInventory({ numVehicles });
      break;
      
    case 'show':
      await populator.showCurrentInventory();
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
        await populator.addHeaders();
        console.log('✅ Headers agregados');
      }
      break;

    case 'create-sheet':
      const creator = await populator.initialize();
      if (creator) {
        await populator.createInventorySheet();
        await populator.addHeaders();
        console.log('✅ Nueva hoja de inventario creada con headers');
      }
      break;
      
    default:
      console.log('📋 COMANDOS DISPONIBLES:');
      console.log('  node scripts/populateInventory.js populate [numero]  - Poblar con vehículos (default: 80)');
      console.log('  node scripts/populateInventory.js show              - Mostrar inventario actual');
      console.log('  node scripts/populateInventory.js clear             - Limpiar inventario');
      console.log('  node scripts/populateInventory.js headers           - Solo agregar headers');
      console.log('  node scripts/populateInventory.js create-sheet      - Crear nueva hoja de inventario');
      console.log('');
      console.log('📝 EJEMPLOS:');
      console.log('  node scripts/populateInventory.js populate 50      - Poblar con 50 vehículos');
      console.log('  node scripts/populateInventory.js populate 100     - Poblar con 100 vehículos');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { InventoryPopulator };