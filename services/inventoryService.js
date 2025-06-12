const { google } = require('googleapis');
const path = require('path');

class InventoryService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = '1Ra62fdHBIZFTDkA6suQcoy987qHo92O4ib84-aBkePA';
    this.sheetName = null;
    this.range = null;
    this.vehicles = [];
    this.lastUpdate = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos en caché
  }

  async initialize() {
    try {
      const credentialsPath = path.join(__dirname, '../creds.json');
      
      this.auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      // Descubrir la estructura del spreadsheet
      await this.discoverSheetStructure();
      
      console.log('✅ Inventory Service inicializado correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Inventory Service:', error.message);
      return false;
    }
  }

  async discoverSheetStructure() {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheets = response.data.sheets;
      
      if (sheets && sheets.length > 0) {
        // Buscar una hoja que contenga "inventario" o usar la primera
        let targetSheet = sheets.find(sheet => 
          sheet.properties.title.toLowerCase().includes('inventario') ||
          sheet.properties.title.toLowerCase().includes('vehiculo')
        );
        
        if (!targetSheet) {
          targetSheet = sheets[0];
        }
        
        this.sheetName = targetSheet.properties.title;
        this.range = `${this.sheetName}!A:D`;
        
        console.log(`📋 Usando hoja: "${this.sheetName}"`);
        return true;
      } else {
        throw new Error('No se encontraron hojas en el spreadsheet');
      }
    } catch (error) {
      console.error('❌ Error descubriendo estructura del sheet:', error.message);
      
      // Fallback
      this.sheetName = 'Sheet1';
      this.range = `${this.sheetName}!A:D`;
      return false;
    }
  }

  async loadVehicles() {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('No se pudo inicializar Google Sheets');
        }
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('⚠️ No se encontraron datos en el inventario');
        return [];
      }

      // Asumir que la primera fila son headers
      const headers = rows[0];
      const vehicles = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.length >= 4) {
          const vehicle = {
            Referencia_Vehiculo: row[0] || '',
            Modelo: row[1] || '',
            Marca: row[2] || '',
            KM: row[3] || ''
          };
          
          // Solo agregar si tiene datos básicos
          if (vehicle.Referencia_Vehiculo && vehicle.Marca && vehicle.Modelo) {
            vehicles.push(vehicle);
          }
        }
      }

      this.vehicles = vehicles;
      this.lastUpdate = new Date();
      
      console.log(`✅ Inventario cargado desde "${this.sheetName}": ${vehicles.length} vehículos`);
      return vehicles;
    } catch (error) {
      console.error('❌ Error cargando inventario:', error.message);
      throw error;
    }
  }

  async getInventory() {
    try {
      // Verificar si necesitamos actualizar el caché
      const now = new Date();
      if (!this.lastUpdate || (now - this.lastUpdate) > this.cacheTimeout) {
        console.log(`🔄 Actualizando inventario desde "${this.sheetName}"...`);
        await this.loadVehicles();
      }

      // Extraer marcas y modelos únicos
      const brands = [...new Set(this.vehicles.map(v => v.Marca))].filter(Boolean).sort();
      const models = [...new Set(this.vehicles.map(v => v.Modelo))].filter(Boolean).sort();

      return {
        success: true,
        vehicles: this.vehicles,
        brands: brands,
        models: models,
        lastUpdate: this.lastUpdate,
        sheetName: this.sheetName
      };
    } catch (error) {
      console.error('❌ Error obteniendo inventario:', error.message);
      return {
        success: false,
        error: error.message,
        vehicles: [],
        brands: [],
        models: []
      };
    }
  }

  async searchVehicles(criteria) {
    try {
      const inventory = await this.getInventory();
      if (!inventory.success) {
        return { success: false, vehicles: [] };
      }

      let filtered = inventory.vehicles;

      // Filtrar por marca
      if (criteria.marca) {
        filtered = filtered.filter(v => 
          v.Marca.toLowerCase().includes(criteria.marca.toLowerCase())
        );
      }

      // Filtrar por modelo
      if (criteria.modelo) {
        filtered = filtered.filter(v => 
          v.Modelo.toLowerCase().includes(criteria.modelo.toLowerCase())
        );
      }

      // Filtrar por kilómetros máximos
      if (criteria.kmMax) {
        filtered = filtered.filter(v => {
          const km = parseInt(v.KM.replace(/[^\d]/g, ''));
          return !isNaN(km) && km <= criteria.kmMax;
        });
      }

      return {
        success: true,
        vehicles: filtered,
        total: filtered.length
      };
    } catch (error) {
      console.error('❌ Error buscando vehículos:', error.message);
      return {
        success: false,
        error: error.message,
        vehicles: []
      };
    }
  }

  async getVehicleByReference(reference) {
    try {
      const inventory = await this.getInventory();
      if (!inventory.success) {
        return null;
      }

      return inventory.vehicles.find(v => 
        v.Referencia_Vehiculo === reference
      ) || null;
    } catch (error) {
      console.error('❌ Error obteniendo vehículo por referencia:', error.message);
      return null;
    }
  }

  async testConnection() {
    try {
      const vehicles = await this.loadVehicles();
      const brands = [...new Set(vehicles.map(v => v.Marca))].filter(Boolean);
      
      return {
        success: true,
        totalVehicles: vehicles.length,
        brands: brands,
        message: 'Conexión exitosa con inventario',
        sheetName: this.sheetName
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        totalVehicles: 0,
        brands: [],
        sheetName: this.sheetName
      };
    }
  }

  // Método para forzar actualización del inventario
  async forceUpdate() {
    this.lastUpdate = null;
    return await this.getInventory();
  }
}

module.exports = { InventoryService };