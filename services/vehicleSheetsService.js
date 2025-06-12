const { google } = require('googleapis');
const path = require('path');

class VehicleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    // Crear un nuevo spreadsheet para leads de vehículos o usar uno existente
    this.spreadsheetId = '1aSdhS-KfxU7bG9aDhvTOb40zfx18qX0NP6vd1KlV8OU'; // Cambiar por el ID de tu sheet de leads
    this.range = 'Leads!A:P'; // Ajustar según el nombre de la hoja
  }

  async initialize() {
    try {
      const credentialsPath = path.join(__dirname, '../creds.json');
      
      this.auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      console.log('✅ Vehicle Sheets Service inicializado correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Vehicle Sheets Service:', error.message);
      return false;
    }
  }

  async addLeadToSheet(leadData) {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('No se pudo inicializar Google Sheets');
        }
      }

      const { cliente, interes, proceso, id } = leadData;
      
      // Preparar los datos para el sheet
      const rowData = [
        id || '',
        new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        cliente.celular || '',
        cliente.nombre || '',
        cliente.email || '',
        interes.marca_interes || '',
        interes.modelo_interes || '',
        interes.tipo_vehiculo || '',
        interes.presupuesto_max || '',
        interes.vehiculo_favorito || '',
        proceso.status || '',
        proceso.fecha_cita ? new Date(proceso.fecha_cita).toLocaleString('es-CO') : '',
        proceso.hora_cita || '',
        proceso.vehiculo_cita || '',
        interes.vehiculos_consultados ? interes.vehiculos_consultados.join(', ') : '',
        proceso.notas_asesor || ''
      ];

      // Agregar fila al sheet
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });

      console.log('✅ Lead agregado a Google Sheets:', {
        spreadsheetId: this.spreadsheetId,
        range: response.data.tableRange,
        updatedRows: response.data.updates.updatedRows
      });

      return {
        success: true,
        spreadsheetId: this.spreadsheetId,
        range: response.data.tableRange,
        updatedRows: response.data.updates.updatedRows
      };

    } catch (error) {
      console.error('❌ Error agregando lead a Google Sheets:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createLeadHeaders() {
    try {
      if (!this.sheets) {
        await this.initialize();
      }

      const headers = [
        'ID_Lead',
        'Fecha_Contacto',
        'Telefono',
        'Nombre_Cliente',
        'Email',
        'Marca_Interes',
        'Modelo_Interes',
        'Tipo_Vehiculo',
        'Presupuesto_Max',
        'Vehiculo_Favorito',
        'Status',
        'Fecha_Cita',
        'Hora_Cita',
        'Vehiculo_Cita',
        'Vehiculos_Consultados',
        'Notas_Asesor'
      ];

      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Leads!A1:P1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers],
        },
      });

      console.log('✅ Headers de leads creados en Google Sheets');
      return { success: true, response: response.data };
    } catch (error) {
      console.error('❌ Error creando headers de leads:', error.message);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'No se pudo inicializar' };
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      return {
        success: true,
        title: response.data.properties.title,
        sheets: response.data.sheets.map(sheet => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { VehicleSheetsService };