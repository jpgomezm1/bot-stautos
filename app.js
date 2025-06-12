const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
require('dotenv').config();

// Importar módulos locales
const { VehicleConversationEngine } = require('./conversation/vehicleEngine');
const { VehicleDatabase } = require('./database/vehicleSchema');
const { formatPhoneNumber, generateVehicleId, logConversation } = require('./utils/helpers');
const { EmailService } = require('./services/emailService');
const { VehicleSheetsService } = require('./services/vehicleSheetsService');
const { InventoryService } = require('./services/inventoryService');
const { ElevenLabsService } = require('./services/elevenLabsService');
const { GCSService } = require('./services/gcsService');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configurar multer para archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Configuración de Claude
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Configuración de UltraMSG
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_BASE_URL = `https://api.ultramsg.com/${INSTANCE_ID}`;

// Número autorizado para usar el bot (puedes cambiarlo según necesites)
const AUTHORIZED_NUMBERS = ['573183351733']; // Array para múltiples números autorizados

// Inicializar sistemas
const vehicleConversationEngine = new VehicleConversationEngine();
const vehicleDB = new VehicleDatabase();
const emailService = new EmailService();
const vehicleSheetsService = new VehicleSheetsService();
const inventoryService = new InventoryService();
const elevenLabsService = new ElevenLabsService();
const gcsService = new GCSService();

// Store para conversaciones activas
const activeConversations = new Map();

// Verificación de servicios al iniciar
(async () => {
  console.log('🔍 Verificando conexión a Redis...');
  const healthCheck = await vehicleDB.healthCheck();
  console.log('📊 Estado de la base de datos:', healthCheck);
  
  if (healthCheck.redis) {
    console.log('✅ Redis conectado y funcionando');
  } else {
    console.log('⚠️ Redis no disponible - usando memoria como fallback');
  }
  
  // Verificar inventario de vehículos
  console.log('🚗 Verificando inventario de vehículos...');
  const inventoryTest = await inventoryService.testConnection();
  if (inventoryTest.success) {
    console.log('✅ Inventario de vehículos cargado exitosamente');
    console.log(`📋 Total vehículos: ${inventoryTest.totalVehicles}`);
  } else {
    console.log('⚠️ Error cargando inventario:', inventoryTest.error);
  }
  
  // Verificar Google Sheets para leads
  console.log('📊 Verificando conexión a Google Sheets...');
  const sheetsTest = await vehicleSheetsService.testConnection();
  if (sheetsTest.success) {
    console.log('✅ Google Sheets conectado exitosamente');
    console.log(`📋 Spreadsheet: ${sheetsTest.title}`);
  } else {
    console.log('⚠️ Google Sheets no disponible:', sheetsTest.error);
  }
  
  // Verificar Google Cloud Storage
  console.log('☁️ Verificando conexión a Google Cloud Storage...');
  const gcsTest = await gcsService.testConnection();
  if (gcsTest.success) {
    console.log('✅ Google Cloud Storage conectado exitosamente');
    console.log(`📁 Bucket: ${gcsTest.bucket}/${gcsTest.folder}`);
  } else {
    console.log('⚠️ Google Cloud Storage no disponible:', gcsTest.error);
  }
})();

// Nueva función para enviar texto
async function sendWhatsAppText(to, message) {
  try {
    const response = await axios.post(`${ULTRAMSG_BASE_URL}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to: to,
      body: message
    });
    
    logConversation(to, message, 'bot');
    return response.data;
  } catch (error) {
    console.error('Error enviando mensaje de texto:', error.response?.data || error.message);
    throw error;
  }
}

// Nueva función para enviar audio
async function sendWhatsAppAudio(to, filePath, fileName) {
  try {
    const fs = require('fs');
    const FormData = require('form-data');
    
    // Crear FormData para enviar el archivo
    const form = new FormData();
    form.append('token', ULTRAMSG_TOKEN);
    form.append('to', to);
    form.append('audio', fs.createReadStream(filePath), {
      filename: fileName,
      contentType: 'audio/mpeg'
    });
    
    const response = await axios.post(`${ULTRAMSG_BASE_URL}/messages/audio`, form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 60000 // 1 minuto timeout para archivos
    });
    
    console.log(`🔊 Audio enviado a ${to}: ${fileName}`);
    return response.data;
  } catch (error) {
    console.error('Error enviando audio:', error.response?.data || error.message);
    throw error;
  }
}

// Nueva función para enviar audio por URL
async function sendWhatsAppAudioByUrl(to, audioUrl) {
  try {
    const response = await axios.post(`${ULTRAMSG_BASE_URL}/messages/audio`, {
      token: ULTRAMSG_TOKEN,
      to: to,
      audio: audioUrl
    });
    
    console.log(`🔊 Audio por URL enviado a ${to}: ${audioUrl}`);
    return response.data;
  } catch (error) {
    console.error('Error enviando audio por URL:', error.response?.data || error.message);
    throw error;
  }
}

// Función para enviar mensaje por WhatsApp (actualizada para usar GCS)
async function sendWhatsAppMessage(to, message, options = {}) {
  try {
    const sendAsAudio = options.sendAsAudio !== false && process.env.ENABLE_AUDIO_MESSAGES === 'true';
    
    if (sendAsAudio) {
      console.log(`🎙️ Generando audio para ${to}...`);
      
      const voiceConfig = elevenLabsService.getVoiceForMessageType(options.messageType || 'general');
      const audioResult = await elevenLabsService.textToSpeech(message, voiceConfig);
      
      if (audioResult.success && audioResult.publicUrl) {
        try {
          // Enviar usando la URL pública de GCS
          const response = await sendWhatsAppAudioByUrl(to, audioResult.publicUrl);
          
          // Programar eliminación del archivo después de 2 horas
          setTimeout(async () => {
            try {
              await gcsService.deleteAudio(audioResult.fileName);
              console.log(`🗑️ Archivo eliminado de GCS: ${audioResult.fileName}`);
            } catch (e) {
              console.log('No se pudo eliminar archivo de GCS');
            }
          }, 2 * 60 * 60 * 1000); // 2 horas
          
          logConversation(to, `[AUDIO-GCS] ${message}`, 'bot');
          return response;
          
        } catch (audioError) {
          console.log('❌ Falló envío como audio, enviando como texto...');
          
          // Limpiar archivo de GCS si falló el envío
          try {
            await gcsService.deleteAudio(audioResult.fileName);
          } catch (e) {}
          
          return await sendWhatsAppText(to, message);
        }
      } else if (audioResult.success && audioResult.filePath) {
        // Fallback a método local si no hay URL pública
        try {
          const response = await sendWhatsAppAudio(to, audioResult.filePath, audioResult.fileName);
          
          // Limpiar archivo temporal después de 30 segundos
          setTimeout(() => {
            try {
              const fs = require('fs');
              fs.unlinkSync(audioResult.filePath);
              console.log(`🗑️ Archivo temporal eliminado: ${audioResult.fileName}`);
            } catch (e) {
              console.log('No se pudo eliminar archivo temporal');
            }
          }, 30000);
          
          logConversation(to, `[AUDIO] ${message}`, 'bot');
          return response;
        } catch (audioError) {
          console.log('❌ Falló envío como audio local, enviando como texto...');
          return await sendWhatsAppText(to, message);
        }
      } else {
        console.log('⚠️ Fallo generación de audio, enviando como texto');
        return await sendWhatsAppText(to, message);
      }
    } else {
      return await sendWhatsAppText(to, message);
    }
  } catch (error) {
    console.error('Error en sendWhatsAppMessage:', error);
    return await sendWhatsAppText(to, message);
  }
}

// Función para procesar mensajes del usuario
async function processUserMessage(phoneNumber, message) {
  try {
    logConversation(phoneNumber, message, 'user');
    
    let leadData = await vehicleDB.findByPhone(phoneNumber);
    
    if (!leadData) {
      // Crear nuevo lead si no existe
      leadData = await vehicleDB.create({
        cliente: {
          celular: phoneNumber,
          nombre: 'Cliente Potencial',
          fecha_inicial_contacto: new Date()
        },
        interes: {},
        proceso: {
          step_actual: 'saludo_inicial',
          status: 'activo',
          conversacion_historial: []
        }
      });
    }
    
    // Guardar el último mensaje del usuario para contexto
    leadData.lastUserMessage = message;
    
    // Procesar mensaje con el motor conversacional
    const response = await vehicleConversationEngine.processResponse(message, leadData);
    
    // Actualizar base de datos
    const updateData = {
      interes: {
        ...leadData.interes,
        ...response.extractedData
      },
      proceso: {
        ...leadData.proceso,
        step_actual: response.waitingFor || leadData.proceso.step_actual,
        ultima_actividad: new Date(),
        conversacion_historial: response.extractedData?.conversacion_historial || leadData.proceso.conversacion_historial
      }
    };
    
    // Manejar diferentes tipos de respuesta
    if (response.type === 'appointment_confirmed') {
      updateData.proceso.status = 'cita_agendada';
      updateData.proceso.fecha_cita = response.appointmentDate;
      
      // Enviar notificación por email
      setTimeout(async () => {
        try {
          const finalLeadData = await vehicleDB.findByPhone(phoneNumber);
          const emailResult = await emailService.sendAppointmentNotification(finalLeadData);
          if (emailResult.success) {
            console.log(`📧 Email de cita enviado: ${emailResult.id}`);
          }
          
          // Registrar en Google Sheets
          const sheetsResult = await vehicleSheetsService.addLeadToSheet(finalLeadData);
          if (sheetsResult.success) {
            console.log(`📊 Lead registrado en Google Sheets`);
          }
        } catch (error) {
          console.error('❌ Error en proceso post-cita:', error);
        }
      }, 2000);
      
      console.log(`📅 Cita agendada exitosamente: ${phoneNumber}`);
    }
    
    await vehicleDB.update(phoneNumber, updateData);
    
    return {
      success: true,
      response: response
    };
    
  } catch (error) {
    console.error('Error procesando mensaje:', error);
    
    // Manejo especial para errores de Claude overloaded
    if (error.message && error.message.includes('overloaded')) {
      const fallbackResponses = [
        "Uy parcero, se me colgó el sistema un momentito 😅 ¿Me puedes repetir lo que me dijiste?",
        "Ay no, se me fue la conexión por un segundo. ¿Qué me estabas comentando?",
        "Perdón, el internet está medio loco hoy. ¿Me vuelves a decir qué necesitas?",
        "Disculpa la demora, se me trabó todo acá. ¿Cuál era tu pregunta?"
      ];
      
      const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      
      return {
        success: true,
        response: {
          type: 'error_natural',
          message: randomResponse,
          waitingFor: 'consulta_general'
        }
      };
    }
    
    // Otros errores
    const naturalErrorResponses = [
      "Oye, se me complicó algo acá en el sistema. ¿Podrías decirme de nuevo qué necesitas?",
      "Perdón, parece que hubo un problemita técnico. ¿Me repites por favor?",
      "Ay, se me fue todo por un momento. ¿Qué me estabas preguntando?",
      "Disculpa, tuve una falla acá. ¿Me cuentas otra vez qué andas buscando?"
    ];
    
    const randomErrorResponse = naturalErrorResponses[Math.floor(Math.random() * naturalErrorResponses.length)];
    
    return {
      success: false,
      message: randomErrorResponse
    };
  }
}

// Webhook para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook recibido:', JSON.stringify(req.body, null, 2));
    
    const { data } = req.body;
    
    if (data && data.from) {
      
      if (data.fromMe === true || data.self === true) {
        console.log('📤 Ignorando mensaje del bot mismo');
        res.status(200).json({ success: true });
        return;
      }
      
      if (req.body.event_type === 'message_ack') {
        console.log('📬 Ignorando ACK');
        res.status(200).json({ success: true });
        return;
      }
      
      if (req.body.event_type !== 'message_received') {
        console.log('📝 Ignorando evento:', req.body.event_type);
        res.status(200).json({ success: true });
        return;
      }
      
      const userMessage = data.body ? data.body.trim() : '';
      const phoneNumber = formatPhoneNumber(data.from);
      
      // Verificar si el número está autorizado
      if (!AUTHORIZED_NUMBERS.includes(phoneNumber)) {
        console.log(`🚫 NÚMERO NO AUTORIZADO: ${phoneNumber}`);
        res.status(200).json({ success: true, message: 'Número no autorizado' });
        return;
      }
      
      console.log(`📱 MENSAJE DE USUARIO AUTORIZADO ${phoneNumber}: ${userMessage}`);
      
      // Verificar si hay una conversación activa
      let conversation = activeConversations.get(phoneNumber) || {
        messages: [],
        lastActivity: new Date(),
        isProcessing: false
      };
      
      // Agregar mensaje a la cola
      conversation.messages.push({
        text: userMessage,
        timestamp: new Date()
      });
      
      conversation.lastActivity = new Date();
      activeConversations.set(phoneNumber, conversation);
      
      // Si no se está procesando, procesar inmediatamente
      if (!conversation.isProcessing) {
        conversation.isProcessing = true;
        
        setTimeout(async () => {
          try {
            const conv = activeConversations.get(phoneNumber);
            if (conv && conv.messages.length > 0) {
              // Combinar todos los mensajes de texto
              const combinedText = conv.messages
                .filter(m => m.text && m.text.trim())
                .map(m => m.text.trim())
                .join(' ');
              
              conv.messages = []; // Limpiar mensajes procesados
              
              // Procesar mensaje
              const result = await processUserMessage(phoneNumber, combinedText || 'mensaje vacío');
              
              if (result.success) {
                await sendWhatsAppMessage(phoneNumber, result.response.message, {
                  messageType: result.response.type === 'appointment_confirmed' ? 'appointment' : 'product_info',
                  sendAsAudio: true
                });
                
                if (result.response.type === 'appointment_confirmed') {
                  console.log(`🎉 ¡CITA AGENDADA! ${phoneNumber}`);
                }
              } else {
                await sendWhatsAppMessage(phoneNumber, result.message, {
                  messageType: 'error',
                  sendAsAudio: true
                });
              }
              
              conv.isProcessing = false;
              activeConversations.set(phoneNumber, conv);
            }
          } catch (error) {
            console.error('Error procesando conversación:', error);
            const conv = activeConversations.get(phoneNumber);
            if (conv) {
              conv.isProcessing = false;
              activeConversations.set(phoneNumber, conv);
            }
            
            try {
              const naturalErrorResponses = [
                "Uy, se me complicó algo acá. ¿Podrías intentar nuevamente?",
                "Ay perdón, se me trabó todo. ¿Me vuelves a escribir?",
                "Disculpa, tuve un problemita técnico. ¿Me repites por favor?"
              ];
              
              const randomResponse = naturalErrorResponses[Math.floor(Math.random() * naturalErrorResponses.length)];
              await sendWhatsAppMessage(phoneNumber, randomResponse, {
                messageType: 'error',
                sendAsAudio: true
              });
            } catch (sendError) {
              console.error('Error enviando mensaje de error:', sendError);
            }
          }
        }, 2000);
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

// Endpoint para simular inicio de conversación (sin formulario)
app.post('/start-conversation', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Número de teléfono requerido' });
    }
    
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    
    // Verificar que sea un número autorizado
    if (!AUTHORIZED_NUMBERS.includes(normalizedPhone)) {
      console.log(`🚫 CONVERSACIÓN RECHAZADA: Número ${normalizedPhone} no autorizado`);
      return res.status(403).json({ 
        error: 'Número no autorizado', 
        authorizedNumbers: AUTHORIZED_NUMBERS 
      });
    }
    
    // Crear registro en base de datos
    const leadData = await vehicleDB.create({
      cliente: {
        celular: normalizedPhone,
        nombre: 'Cliente Potencial',
        fecha_inicial_contacto: new Date()
      },
      interes: {},
      proceso: {
        step_actual: 'saludo_inicial',
        status: 'activo',
        conversacion_historial: []
      }
    });
    
    console.log(`💾 Lead creado con ID: ${leadData.id} para número: ${normalizedPhone}`);
    
    // Obtener inventario para mensaje personalizado
    const inventory = await inventoryService.getInventory();
    
    // Mensaje inicial más natural y personalizado
    const initialMessage = `¡Ey! ¿Qué tal? Soy Carlos del concesionario 👋

Me da mucho gusto saludarte. Veo que andas buscando carro, ¿cierto? Pues llegaste al lugar indicado porque tenemos unas opciones que te van a encantar.

Te cuento que tenemos más de ${inventory.success ? inventory.vehicles.length : '50'} vehículos en el lote, de todas las marcas: Toyota, Chevrolet, Nissan, Ford, y muchas más.

¿Qué te parece si me cuentas qué tipo de carro andas buscando? ¿Es para la familia, para el trabajo, o qué tienes en mente? 

Acá relajado conversamos y encontramos algo que te guste y que esté dentro de tu presupuesto 😊`;

    await sendWhatsAppMessage(normalizedPhone, initialMessage, { 
      messageType: 'greeting',
      sendAsAudio: true 
    });
    
    res.json({ 
      success: true, 
      message: 'Conversación iniciada exitosamente',
      leadId: leadData.id,
      phoneNumber: normalizedPhone,
      authorized: true
    });
    
  } catch (error) {
    console.error('Error iniciando conversación:', error);
    res.status(500).json({ error: 'Error iniciando conversación' });
  }
});

// Endpoints administrativos
app.get('/leads', async (req, res) => {
  try {
    const allLeads = await vehicleDB.getAll();
    const leads = allLeads.map(lead => ({
      id: lead.id,
      cliente: lead.cliente?.nombre || 'Cliente Potencial',
      telefono: lead.cliente?.celular,
      interes: {
        marca: lead.interes?.marca_interes || 'No especificado',
        tipo: lead.interes?.tipo_vehiculo || 'No especificado',
        presupuesto: lead.interes?.presupuesto_max || 'No especificado'
      },
      status: lead.proceso?.status || 'indefinido',
      ultima_actividad: lead.proceso?.ultima_actividad,
      fecha_inicio: lead.proceso?.fecha_inicio || lead.cliente?.fecha_inicial_contacto,
      fecha_cita: lead.proceso?.fecha_cita,
      autorizado: AUTHORIZED_NUMBERS.includes(lead.cliente?.celular),
      conversaciones: lead.proceso?.conversacion_historial?.length || 0
    }));
    
    res.json({ 
      leads, 
      total: leads.length,
      authorizedNumbers: AUTHORIZED_NUMBERS,
      authorizedLeads: leads.filter(l => l.autorizado).length,
      activeLeads: leads.filter(l => l.status === 'activo').length,
      appointmentScheduled: leads.filter(l => l.status === 'cita_agendada').length
    });
  } catch (error) {
    console.error('Error obteniendo leads:', error);
    res.status(500).json({ error: 'Error obteniendo leads' });
  }
});

app.get('/inventory', async (req, res) => {
  try {
    const inventory = await inventoryService.getInventory();
    
    if (inventory.success) {
      res.json({
        success: true,
        vehicles: inventory.vehicles,
        total: inventory.vehicles.length,
        brands: inventory.brands,
        models: inventory.models
      });
    } else {
      res.status(500).json({
        success: false,
        error: inventory.error
      });
    }
  } catch (error) {
    console.error('Error obteniendo inventario:', error);
    res.status(500).json({ error: 'Error obteniendo inventario' });
  }
});

app.get('/lead/:phone', async (req, res) => {
  try {
    const phoneNumber = formatPhoneNumber(req.params.phone);
    const lead = await vehicleDB.findByPhone(phoneNumber);
    
    if (lead) {
      res.json({
        ...lead,
        authorized: AUTHORIZED_NUMBERS.includes(phoneNumber),
        currentStep: lead.proceso?.step_actual,
        vehiculosInteres: lead.interes?.vehiculos_consultados || [],
        conversationHistory: lead.proceso?.conversacion_historial || []
      });
    } else {
      res.status(404).json({ error: 'Lead no encontrado' });
    }
  } catch (error) {
    console.error('Error obteniendo lead:', error);
    res.status(500).json({ error: 'Error obteniendo lead' });
  }
});

// Limpiar datos de un número específico
app.delete('/admin/clear-data/:phone', async (req, res) => {
  try {
    const phoneNumber = formatPhoneNumber(req.params.phone);
    
    const deleted = await vehicleDB.delete(phoneNumber);
    activeConversations.delete(phoneNumber);
    
    res.json({
      success: true,
      message: 'Datos limpiados exitosamente',
      phoneNumber: phoneNumber,
      deleted: deleted
    });
  } catch (error) {
    console.error('Error limpiando datos:', error);
    res.status(500).json({ error: 'Error limpiando datos' });
  }
});

// Endpoint para probar inventario
app.get('/admin/test-inventory', async (req, res) => {
  try {
    console.log('🧪 Probando conexión con inventario...');
    
    const testResult = await inventoryService.testConnection();
    
    res.json({
      success: testResult.success,
      message: testResult.success ? 'Inventario cargado exitosamente' : 'Error cargando inventario',
      totalVehicles: testResult.totalVehicles || 0,
      brands: testResult.brands || [],
      error: testResult.error || null
    });
    
  } catch (error) {
    console.error('Error probando inventario:', error);
    res.status(500).json({ error: 'Error probando inventario' });
  }
});

// Endpoint para probar GCS
app.get('/admin/test-gcs', async (req, res) => {
  try {
    const testResult = await gcsService.testConnection();
    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar audios en GCS
app.get('/admin/gcs-audios', async (req, res) => {
  try {
    const result = await gcsService.listAudios();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para limpiar audios antiguos
app.post('/admin/clean-gcs-audios', async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    const result = await gcsService.cleanOldAudios(maxAgeHours);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para ver conversaciones activas
app.get('/conversations', (req, res) => {
  const conversations = [];
  activeConversations.forEach((conv, phone) => {
    conversations.push({
      phoneNumber: phone,
      messagesInQueue: conv.messages.length,
      isProcessing: conv.isProcessing,
      lastActivity: conv.lastActivity,
      authorized: AUTHORIZED_NUMBERS.includes(phone)
    });
  });
  
  res.json({ 
    conversations, 
    total: conversations.length,
    authorizedNumbers: AUTHORIZED_NUMBERS
  });
});

// Endpoint para estadísticas del sistema
app.get('/stats', async (req, res) => {
  try {
    const leads = await vehicleDB.getAll();
    const inventory = await inventoryService.getInventory();
    
    // Estadísticas de leads
    const leadStats = {
      total: leads.length,
      activos: leads.filter(l => l.proceso?.status === 'activo').length,
      conCita: leads.filter(l => l.proceso?.status === 'cita_agendada').length,
      completados: leads.filter(l => l.proceso?.status === 'completado').length
    };
    
    // Marcas más consultadas
    const marcasConsultadas = {};
    leads.forEach(lead => {
      if (lead.interes?.marca_interes) {
        const marca = lead.interes.marca_interes;
        marcasConsultadas[marca] = (marcasConsultadas[marca] || 0) + 1;
      }
    });
    
    // Inventario stats
    const inventoryStats = inventory.success ? {
      totalVehicles: inventory.vehicles.length,
      brands: inventory.brands.length,
      lastUpdate: inventory.lastUpdate
    } : { totalVehicles: 0, brands: 0, lastUpdate: null };
    
    res.json({
      leads: leadStats,
      inventory: inventoryStats,
      marcasPopulares: marcasConsultadas,
      conversacionesActivas: activeConversations.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await vehicleDB.healthCheck();
    const inventoryHealth = await inventoryService.testConnection();
    const gcsHealth = await gcsService.testConnection();
    
    const services = {
      database: {
        redis: dbHealth.redis,
        memory: dbHealth.memory > 0,
        total: dbHealth.total
      },
      inventory: {
        configured: true,
        loaded: inventoryHealth.success,
        totalVehicles: inventoryHealth.totalVehicles || 0
      },
      email: {
        configured: !!(process.env.RESEND_API_KEY && process.env.DOMAIN),
        ready: !!(process.env.RESEND_API_KEY && process.env.DOMAIN)
      },
      claude: {
        configured: !!process.env.CLAUDE_API_KEY,
        ready: !!process.env.CLAUDE_API_KEY
      },
      ultramsg: {
        configured: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID),
        ready: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID)
      },
      elevenlabs: {
        configured: !!process.env.ELEVENLABS_API_KEY,
        ready: !!process.env.ELEVENLABS_API_KEY
      },
      gcs: {
        configured: gcsHealth.success,
        ready: gcsHealth.success,
        bucket: gcsHealth.bucket || null,
        folder: gcsHealth.folder || null
      }
    };
    
    const allServicesReady = Object.values(services).every(service => service.ready || service.loaded);
    
    res.json({ 
      status: allServicesReady ? 'OK' : 'PARTIAL',
      timestamp: new Date().toISOString(),
      activeConversations: activeConversations.size,
      totalLeads: dbHealth.total,
      uptime: process.uptime(),
      authorizedNumbers: AUTHORIZED_NUMBERS,
      environment: process.env.NODE_ENV || 'development',
      services: services,
      version: '2.0-natural-gcs'
    });
  } catch (error) {
    console.error('Error en health check:', error);
    res.status(500).json({ 
      status: 'ERROR',
      error: 'Error en health check',
      timestamp: new Date().toISOString()
    });
  }
});

// Limpiar archivos antiguos de GCS cada 6 horas
setInterval(async () => {
  try {
    await gcsService.cleanOldAudios(6); // Eliminar archivos mayores a 6 horas
  } catch (error) {
    console.error('Error limpiando archivos antiguos de GCS:', error);
  }
}, 6 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚗 BOT CONCESIONARIO INICIADO EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log(`🌐 Servidor: http://localhost:${PORT}`);
  console.log(`🔐 Números autorizados: ${AUTHORIZED_NUMBERS.join(', ')}`);
  console.log('');
  console.log('📋 ENDPOINTS PRINCIPALES:');
  console.log(`🚀 Iniciar conversación: POST ${PORT}/start-conversation`);
  console.log(`💬 Webhook WhatsApp: POST ${PORT}/webhook`);
  console.log(`📊 Leads: GET ${PORT}/leads`);
  console.log(`🚗 Inventario: GET ${PORT}/inventory`);
  console.log(`🏥 Health Check: GET ${PORT}/health`);
  console.log(`📈 Estadísticas: GET ${PORT}/stats`);
  console.log('');
  console.log('🔧 ENDPOINTS ADMINISTRATIVOS:');
  console.log(`🗑️ Limpiar datos: DELETE ${PORT}/admin/clear-data/{phone}`);
  console.log(`🧪 Test inventario: GET ${PORT}/admin/test-inventory`);
  console.log(`☁️ Test GCS: GET ${PORT}/admin/test-gcs`);
  console.log(`📁 Listar audios GCS: GET ${PORT}/admin/gcs-audios`);
  console.log(`🧹 Limpiar audios GCS: POST ${PORT}/admin/clean-gcs-audios`);
  console.log('');
  console.log('🎯 BOT PARA COMPRA-VENTA DE VEHÍCULOS v2.0-GCS');
  console.log('💡 Funcionalidades:');
  console.log('   🗣️ Conversaciones súper naturales con Carlos');
  console.log('   📋 Consulta de inventario desde Google Sheets');
  console.log('   🤖 IA conversacional avanzada con Claude');
  console.log('   📅 Agendamiento de citas intuitivo');
  console.log('   📧 Notificaciones automáticas por email');
  console.log('   📊 Registro de leads en Google Sheets');
  console.log('   💬 Manejo inteligente de errores');
  console.log('   🧠 Memoria conversacional');
  console.log('   🎙️ Mensajes de voz con ElevenLabs');
  console.log('   ☁️ Almacenamiento de audio en Google Cloud Storage');
  console.log('='.repeat(60));
  console.log('🎉 ¡Listo para conversaciones naturales con audio en la nube!');
  console.log('='.repeat(60) + '\n');
});