// database/redis.js
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = new Redis({
      host: process.env.UPSTASH_REDIS_URL?.replace('https://', '').replace('redis://', ''),
      port: 6379,
      password: process.env.UPSTASH_REDIS_TOKEN,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      tls: process.env.UPSTASH_REDIS_URL?.startsWith('https') ? {} : undefined
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis conectado exitosamente');
    });

    this.client.on('error', (err) => {
      console.error('❌ Error Redis:', err.message);
    });
  }

  // Normalizar número de teléfono para clave consistente
  _normalizePhoneKey(phoneNumber) {
    // Siempre usar formato completo con 57
    let normalized = phoneNumber.toString().replace(/[^\d]/g, '');
    
    if (normalized.startsWith('57')) {
      return normalized;
    } else if (normalized.startsWith('3')) {
      return '57' + normalized;
    } else {
      return '57' + normalized;
    }
  }

  // Guardar datos de lead/propiedad
  async saveProperty(phoneNumber, leadData) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `lead:${normalizedPhone}`;
      const value = JSON.stringify({
        ...leadData,
        lastUpdated: new Date().toISOString()
      });
      
      await this.client.setex(key, 86400, value); // Expira en 24 horas
      console.log(`💾 Lead guardado en Redis: ${normalizedPhone} (clave: ${key})`);
      return true;
    } catch (error) {
      console.error('Error guardando en Redis:', error);
      return false;
    }
  }

  // Obtener datos de lead/propiedad
  async getProperty(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `lead:${normalizedPhone}`;
      const data = await this.client.get(key);
      
      if (data) {
        const leadData = JSON.parse(data);
        console.log(`📖 Lead encontrado en Redis: ${normalizedPhone} (clave: ${key})`);
        return leadData;
      }
      
      console.log(`🔍 No se encontró lead en Redis: ${normalizedPhone} (clave: ${key})`);
      return null;
    } catch (error) {
      console.error('Error obteniendo de Redis:', error);
      return null;
    }
  }

  // Actualizar datos de lead/propiedad
  async updateProperty(phoneNumber, updates) {
    try {
      const existing = await this.getProperty(phoneNumber);
      if (!existing) {
        const normalizedPhone = this._normalizePhoneKey(phoneNumber);
        console.log(`❌ No se puede actualizar - lead no existe: ${normalizedPhone}`);
        return false;
      }

      const updated = {
        ...existing,
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      return await this.saveProperty(phoneNumber, updated);
    } catch (error) {
      console.error('Error actualizando en Redis:', error);
      return false;
    }
  }

  // Guardar estado de conversación
  async saveConversationState(phoneNumber, state) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `conversation:${normalizedPhone}`;
      const value = JSON.stringify({
        ...state,
        lastUpdated: new Date().toISOString()
      });
      
      await this.client.setex(key, 3600, value); // Expira en 1 hora
      console.log(`💬 Conversación guardada: ${normalizedPhone}`);
      return true;
    } catch (error) {
      console.error('Error guardando conversación en Redis:', error);
      return false;
    }
  }

  // Obtener estado de conversación
  async getConversationState(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `conversation:${normalizedPhone}`;
      const data = await this.client.get(key);
      
      if (data) {
        console.log(`📖 Conversación encontrada: ${normalizedPhone}`);
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('Error obteniendo conversación de Redis:', error);
      return null;
    }
  }

  // Listar todos los leads/propiedades
  async getAllProperties() {
    try {
      const keys = await this.client.keys('lead:*');
      const leads = [];
      
      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const lead = JSON.parse(data);
          lead.phoneNumber = key.replace('lead:', '');
          leads.push(lead);
        }
      }
      
      console.log(`📊 Total leads en Redis: ${leads.length}`);
      return leads;
    } catch (error) {
      console.error('Error obteniendo todos los leads:', error);
      return [];
    }
  }

  // Eliminar lead/propiedad
  async deleteProperty(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const leadKey = `lead:${normalizedPhone}`;
      const conversationKey = `conversation:${normalizedPhone}`;
      
      const deleted1 = await this.client.del(leadKey);
      const deleted2 = await this.client.del(conversationKey);
      
      console.log(`🗑️ Lead eliminado de Redis: ${normalizedPhone} (eliminadas: ${deleted1 + deleted2} claves)`);
      return deleted1 > 0 || deleted2 > 0;
    } catch (error) {
      console.error('Error eliminando de Redis:', error);
      return false;
    }
  }

  // Verificar conexión
  async ping() {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Error en ping Redis:', error);
      return false;
    }
  }

  // Debug: listar todas las claves
  async debugKeys() {
    try {
      const allKeys = await this.client.keys('*');
      console.log('🔍 Todas las claves en Redis:', allKeys);
      return allKeys;
    } catch (error) {
      console.error('Error obteniendo claves:', error);
      return [];
    }
  }

  // Método específico para vehículos - buscar leads por interés
  async findLeadsByBrand(brand) {
    try {
      const allLeads = await this.getAllProperties();
      return allLeads.filter(lead => 
        lead.interes?.marca_interes?.toLowerCase().includes(brand.toLowerCase())
      );
    } catch (error) {
      console.error('Error buscando leads por marca:', error);
      return [];
    }
  }

  // Método específico para vehículos - buscar leads con citas
  async findLeadsWithAppointments() {
    try {
      const allLeads = await this.getAllProperties();
      return allLeads.filter(lead => 
        lead.proceso?.status === 'cita_agendada' && lead.proceso?.fecha_cita
      );
    } catch (error) {
      console.error('Error buscando leads con citas:', error);
      return [];
    }
  }

  // Estadísticas para el dashboard
  async getLeadStats() {
    try {
      const allLeads = await this.getAllProperties();
      
      const stats = {
        total: allLeads.length,
        activos: allLeads.filter(l => l.proceso?.status === 'activo').length,
        conCita: allLeads.filter(l => l.proceso?.status === 'cita_agendada').length,
        completados: allLeads.filter(l => l.proceso?.status === 'completado').length,
        marcasInteres: {},
        ultimaActividad: null
      };

      // Contar marcas de interés
      allLeads.forEach(lead => {
        if (lead.interes?.marca_interes) {
          const marca = lead.interes.marca_interes;
          stats.marcasInteres[marca] = (stats.marcasInteres[marca] || 0) + 1;
        }
      });

      // Encontrar última actividad
      const actividades = allLeads
        .map(l => l.proceso?.ultima_actividad)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a));
      
      if (actividades.length > 0) {
        stats.ultimaActividad = actividades[0];
      }

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return {
        total: 0,
        activos: 0,
        conCita: 0,
        completados: 0,
        marcasInteres: {},
        ultimaActividad: null
      };
    }
  }
}

module.exports = { RedisClient };