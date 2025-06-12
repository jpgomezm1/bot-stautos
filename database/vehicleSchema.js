const { RedisClient } = require('./redis');
const { formatPhoneNumber } = require('../utils/helpers');

const vehicleLeadSchema = {
  id: String,
  cliente: {
    celular: String,
    nombre: String,
    email: String,
    fecha_inicial_contacto: Date
  },
  
  interes: {
    marca_interes: String,
    modelo_interes: String,
    tipo_vehiculo: String,
    presupuesto_max: Number,
    vehiculos_consultados: Array,
    vehiculo_favorito: String,
    observaciones: String
  },
  
  proceso: {
    step_actual: String,
    status: String, // 'activo', 'cita_agendada', 'sin_interes', 'completado'
    fecha_inicio: Date,
    fecha_cita: Date,
    hora_cita: String,
    vehiculo_cita: String,
    ultima_actividad: Date,
    notas_asesor: String
  }
};

class VehicleDatabase {
  constructor() {
    this.redis = new RedisClient();
    this.memoryFallback = new Map();
  }

  async create(data) {
    const id = `LEAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const leadData = {
      id,
      ...data,
      proceso: {
        ...data.proceso,
        fecha_inicio: new Date(),
        status: data.proceso?.status || 'activo'
      }
    };
    
    const phoneNumber = formatPhoneNumber(data.cliente.celular);
    console.log(`📞 Normalizando número para crear lead: ${data.cliente.celular} -> ${phoneNumber}`);
    
    leadData.cliente.celular = phoneNumber;
    
    // Intentar guardar en Redis
    const redisSaved = await this.redis.saveProperty(phoneNumber, leadData);
    
    if (!redisSaved) {
      console.log('⚠️ Usando fallback de memoria para crear lead');
      this.memoryFallback.set(phoneNumber, leadData);
    }
    
    return leadData;
  }
  
  async findByPhone(phoneNumber) {
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🔍 Buscando lead: ${phoneNumber} -> ${normalizedPhone}`);
    
    // Intentar obtener de Redis primero
    let lead = await this.redis.getProperty(normalizedPhone);
    
    if (!lead) {
      // Fallback a memoria
      lead = this.memoryFallback.get(normalizedPhone) || null;
      if (lead) {
        console.log('📱 Usando datos de memoria (fallback)');
      } else {
        console.log(`❌ Lead no encontrado en Redis ni memoria: ${normalizedPhone}`);
      }
    }
    
    return lead;
  }
  
  async update(phoneNumber, data) {
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🔄 Actualizando lead: ${phoneNumber} -> ${normalizedPhone}`);
    
    // Intentar actualizar en Redis
    const redisUpdated = await this.redis.updateProperty(normalizedPhone, data);
    
    if (!redisUpdated) {
      // Fallback a memoria
      const existing = this.memoryFallback.get(normalizedPhone);
      if (existing) {
        const updated = {
          ...existing,
          ...data,
          proceso: {
            ...existing.proceso,
            ...data.proceso,
            ultima_actividad: new Date()
          }
        };
        this.memoryFallback.set(normalizedPhone, updated);
        console.log('⚠️ Actualizado en memoria (fallback)');
        return updated;
      } else {
        console.log(`❌ No se pudo actualizar - lead no existe: ${normalizedPhone}`);
        return null;
      }
    }
    
    return await this.findByPhone(normalizedPhone);
  }
  
  async getAll() {
    // Obtener de Redis
    const redisLeads = await this.redis.getAllProperties();
    
    // Combinar con memoria (fallback)
    const memoryLeads = Array.from(this.memoryFallback.values());
    
    // Eliminar duplicados (preferir Redis)
    const allLeads = [...redisLeads];
    const redisPhones = new Set(redisLeads.map(l => {
      const phone = l.cliente?.celular || l.phoneNumber;
      return formatPhoneNumber(phone);
    }));
    
    memoryLeads.forEach(lead => {
      const normalizedPhone = formatPhoneNumber(lead.cliente.celular);
      if (!redisPhones.has(normalizedPhone)) {
        allLeads.push(lead);
      }
    });
    
    console.log(`📊 Total leads encontrados: ${allLeads.length} (Redis: ${redisLeads.length}, Memoria: ${memoryLeads.length})`);
    return allLeads;
  }
  
  async delete(phoneNumber) {
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🗑️ Eliminando lead: ${phoneNumber} -> ${normalizedPhone}`);
    
    const redisDeleted = await this.redis.deleteProperty(normalizedPhone);
    const memoryDeleted = this.memoryFallback.delete(normalizedPhone);
    
    console.log(`🗑️ Eliminación completada - Redis: ${redisDeleted}, Memoria: ${memoryDeleted}`);
    return redisDeleted || memoryDeleted;
  }

  async healthCheck() {
    const redisOk = await this.redis.ping();
    const totalLeads = await this.getAll();
    
    return {
      redis: redisOk,
      memory: this.memoryFallback.size,
      total: totalLeads.length
    };
  }
}

module.exports = { vehicleLeadSchema, VehicleDatabase };