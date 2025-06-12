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
      
      console.log('✅ Enhanced Inventory Service inicializado correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Enhanced Inventory Service:', error.message);
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
        this.range = `${this.sheetName}!A:O`; // Expandido para incluir imágenes
        
        console.log(`📋 Usando hoja: "${this.sheetName}"`);
        return true;
      } else {
        throw new Error('No se encontraron hojas en el spreadsheet');
      }
    } catch (error) {
      console.error('❌ Error descubriendo estructura del sheet:', error.message);
      
      // Fallback
      this.sheetName = 'Sheet1';
      this.range = `${this.sheetName}!A:O`; // Expandido
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
          const vehicle = {};
          
          // Mapear dinámicamente según los headers disponibles
          headers.forEach((header, index) => {
            if (row[index] !== undefined) {
              vehicle[header] = row[index];
            }
          });
          
          // Asegurar compatibilidad con formato anterior
          if (!vehicle.Referencia_Vehiculo && vehicle[headers[0]]) {
            vehicle.Referencia_Vehiculo = vehicle[headers[0]];
          }
          if (!vehicle.Marca && vehicle[headers[1]]) {
            vehicle.Marca = vehicle[headers[1]];
          }
          if (!vehicle.Modelo && vehicle[headers[2]]) {
            vehicle.Modelo = vehicle[headers[2]];
          }
          if (!vehicle.KM && vehicle.Kilometraje) {
            vehicle.KM = vehicle.Kilometraje;
          }
          
          // Procesar imágenes si existen
          if (vehicle.Imagenes) {
            vehicle.ImagenesArray = vehicle.Imagenes.split(',').map(img => img.trim()).filter(img => img);
          }
          
          // Solo agregar si tiene datos básicos
          if (vehicle.Referencia_Vehiculo && vehicle.Marca && vehicle.Modelo) {
            vehicles.push(vehicle);
          }
        }
      }

      this.vehicles = vehicles;
      this.lastUpdate = new Date();
      
      console.log(`✅ Inventario mejorado cargado desde "${this.sheetName}": ${vehicles.length} vehículos`);
      return vehicles;
    } catch (error) {
      console.error('❌ Error cargando inventario mejorado:', error.message);
      throw error;
    }
  }

  async getInventory() {
    try {
      // Verificar si necesitamos actualizar el caché
      const now = new Date();
      if (!this.lastUpdate || (now - this.lastUpdate) > this.cacheTimeout) {
        console.log(`🔄 Actualizando inventario mejorado desde "${this.sheetName}"...`);
        await this.loadVehicles();
      }

      // Extraer marcas, modelos, tipos y otros datos únicos
      const brands = [...new Set(this.vehicles.map(v => v.Marca))].filter(Boolean).sort();
      const models = [...new Set(this.vehicles.map(v => v.Modelo))].filter(Boolean).sort();
      const types = [...new Set(this.vehicles.map(v => v.Tipo_Vehiculo))].filter(Boolean).sort();
      const colors = [...new Set(this.vehicles.map(v => v.Color))].filter(Boolean).sort();
      const transmissions = [...new Set(this.vehicles.map(v => v.Transmision))].filter(Boolean).sort();

      return {
        success: true,
        vehicles: this.vehicles,
        brands: brands,
        models: models,
        types: types,
        colors: colors,
        transmissions: transmissions,
        lastUpdate: this.lastUpdate,
        sheetName: this.sheetName
      };
    } catch (error) {
      console.error('❌ Error obteniendo inventario mejorado:', error.message);
      return {
        success: false,
        error: error.message,
        vehicles: [],
        brands: [],
        models: [],
        types: [],
        colors: [],
        transmissions: []
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

      // Filtrar por tipo de vehículo
      if (criteria.tipo) {
        filtered = filtered.filter(v => 
          v.Tipo_Vehiculo && v.Tipo_Vehiculo.toLowerCase().includes(criteria.tipo.toLowerCase())
        );
      }

      // Filtrar por año
      if (criteria.yearMin) {
        filtered = filtered.filter(v => {
          const year = parseInt(v.Año);
          return !isNaN(year) && year >= criteria.yearMin;
        });
      }

      if (criteria.yearMax) {
        filtered = filtered.filter(v => {
          const year = parseInt(v.Año);
          return !isNaN(year) && year <= criteria.yearMax;
        });
      }

      // Filtrar por kilómetros máximos
      if (criteria.kmMax) {
        filtered = filtered.filter(v => {
          const kmField = v.KM || v.Kilometraje || '';
          const km = parseInt(kmField.replace(/[^\d]/g, ''));
          return !isNaN(km) && km <= criteria.kmMax;
        });
      }

      // Filtrar por precio máximo
      if (criteria.precioMax) {
        filtered = filtered.filter(v => {
          if (!v.Precio) return true;
          const precio = parseInt(v.Precio.replace(/[^\d]/g, ''));
          return !isNaN(precio) && precio <= criteria.precioMax;
        });
      }

      // Filtrar por color
      if (criteria.color) {
        filtered = filtered.filter(v => 
          v.Color && v.Color.toLowerCase().includes(criteria.color.toLowerCase())
        );
      }

      // Filtrar por transmisión
      if (criteria.transmision) {
        filtered = filtered.filter(v => 
          v.Transmision && v.Transmision.toLowerCase().includes(criteria.transmision.toLowerCase())
        );
      }

      // Filtrar por combustible
      if (criteria.combustible) {
        filtered = filtered.filter(v => 
          v.Combustible && v.Combustible.toLowerCase().includes(criteria.combustible.toLowerCase())
        );
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

  // Nuevo método para obtener detalles completos de un vehículo
  async getVehicleDetails(reference) {
    try {
      const vehicle = await this.getVehicleByReference(reference);
      
      if (!vehicle) {
        return { success: false, message: 'Vehículo no encontrado' };
      }

      // Crear descripción completa para el bot
      const details = {
        referencia: vehicle.Referencia_Vehiculo,
        marca: vehicle.Marca,
        modelo: vehicle.Modelo,
        año: vehicle.Año,
        kilometraje: vehicle.KM || vehicle.Kilometraje,
        tipo: vehicle.Tipo_Vehiculo,
        cilindraje: vehicle.Cilindraje,
        transmision: vehicle.Transmision,
        combustible: vehicle.Combustible,
        color: vehicle.Color,
        precio: vehicle.Precio,
        estado: vehicle.Estado,
        descripcion: vehicle.Descripcion,
        ubicacion: vehicle.Ubicacion,
        imagenes: vehicle.Imagenes,
        imagenesArray: vehicle.ImagenesArray,
        
        // Descripción formateada para el bot
        descripcionCompleta: this.formatVehicleDescription(vehicle)
      };

      return { success: true, vehicle: details };
    } catch (error) {
      console.error('❌ Error obteniendo detalles del vehículo:', error.message);
      return { success: false, error: error.message };
    }
  }

  formatVehicleDescription(vehicle) {
    let description = `${vehicle.Marca} ${vehicle.Modelo}`;
    
    if (vehicle.Año) description += ` ${vehicle.Año}`;
    if (vehicle.Tipo_Vehiculo) description += ` (${vehicle.Tipo_Vehiculo})`;
    
    const details = [];
    if (vehicle.KM || vehicle.Kilometraje) details.push(`${vehicle.KM || vehicle.Kilometraje} km`);
    if (vehicle.Transmision) details.push(`${vehicle.Transmision}`);
    if (vehicle.Combustible) details.push(`${vehicle.Combustible}`);
    if (vehicle.Color) details.push(`Color ${vehicle.Color}`);
    if (vehicle.Cilindraje) details.push(`Motor ${vehicle.Cilindraje}`);
    
    if (details.length > 0) {
      description += ` - ${details.join(', ')}`;
    }
    
    if (vehicle.Precio) {
      description += ` - Precio: $${vehicle.Precio}`;
    }
    
    if (vehicle.Ubicacion) {
      description += ` - Ubicado en ${vehicle.Ubicacion}`;
    }

    return description;
  }

  async testConnection() {
    try {
      const vehicles = await this.loadVehicles();
      const brands = [...new Set(vehicles.map(v => v.Marca))].filter(Boolean);
      const types = [...new Set(vehicles.map(v => v.Tipo_Vehiculo))].filter(Boolean);
      
      return {
        success: true,
        totalVehicles: vehicles.length,
        brands: brands,
        types: types,
        message: 'Conexión exitosa con inventario mejorado',
        sheetName: this.sheetName,
        hasEnhancedData: vehicles.length > 0 && vehicles[0].Precio !== undefined,
        hasImages: vehicles.length > 0 && vehicles[0].ImagenesArray !== undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        totalVehicles: 0,
        brands: [],
        types: [],
        sheetName: this.sheetName
      };
    }
  }

  // Método para forzar actualización del inventario
  async forceUpdate() {
    this.lastUpdate = null;
    return await this.getInventory();
  }

  // Nuevo método para estadísticas avanzadas
  async getInventoryStats() {
    try {
      const inventory = await this.getInventory();
      if (!inventory.success) {
        return { success: false };
      }

      const stats = {
        total: inventory.vehicles.length,
        marcas: {},
        tipos: {},
        años: {},
        precios: {
          min: null,
          max: null,
          promedio: 0
        },
        transmisiones: {},
        combustibles: {},
        withImages: 0
      };

      let precioTotal = 0;
      let vehiculosConPrecio = 0;

      inventory.vehicles.forEach(v => {
        // Contar marcas
        if (v.Marca) {
          stats.marcas[v.Marca] = (stats.marcas[v.Marca] || 0) + 1;
        }

        // Contar tipos
        if (v.Tipo_Vehiculo) {
          stats.tipos[v.Tipo_Vehiculo] = (stats.tipos[v.Tipo_Vehiculo] || 0) + 1;
        }

        // Contar años
        if (v.Año) {
          stats.años[v.Año] = (stats.años[v.Año] || 0) + 1;
        }

        // Calcular estadísticas de precios
        if (v.Precio) {
          const precio = parseInt(v.Precio.replace(/[^\d]/g, ''));
          if (!isNaN(precio)) {
            precioTotal += precio;
            vehiculosConPrecio++;
            
            if (stats.precios.min === null || precio < stats.precios.min) {
              stats.precios.min = precio;
            }
            if (stats.precios.max === null || precio > stats.precios.max) {
              stats.precios.max = precio;
            }
          }
        }

        // Contar transmisiones
        if (v.Transmision) {
          stats.transmisiones[v.Transmision] = (stats.transmisiones[v.Transmision] || 0) + 1;
        }

        // Contar combustibles
        if (v.Combustible) {
          stats.combustibles[v.Combustible] = (stats.combustibles[v.Combustible] || 0) + 1;
        }

        // Contar vehículos con imágenes
        if (v.ImagenesArray && v.ImagenesArray.length > 0) {
          stats.withImages++;
        }
      });

      if (vehiculosConPrecio > 0) {
        stats.precios.promedio = Math.round(precioTotal / vehiculosConPrecio);
      }

      return { success: true, stats };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { InventoryService };