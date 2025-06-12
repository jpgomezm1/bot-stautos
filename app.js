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
const { TranscriptionService } = require('./services/transcriptionService');
const { ImageService } = require('./services/imageService');

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
const transcriptionService = new TranscriptionService();
const imageService = new ImageService();

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
    console.log(`🖼️ Vehículos con imágenes: ${inventoryTest.hasImages ? 'Sí' : 'No'}`);
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

// Función para enviar mensaje por WhatsApp (actualizada para usar análisis de tono)
async function sendWhatsAppMessage(to, message, options = {}) {
  try {
    const sendAsAudio = options.sendAsAudio !== false && process.env.ENABLE_AUDIO_MESSAGES === 'true';
    
    if (sendAsAudio) {
      console.log(`🎙️ Generando audio para ${to}...`);
      
      // Analizar el tono del mensaje para configuración óptima
      const analyzedTone = elevenLabsService.analyzeMessageTone(message);
      const voiceConfig = elevenLabsService.getVoiceForMessageType(analyzedTone);
      
      console.log(`🎭 Tono detectado: ${analyzedTone}`);
      
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
async function processUserMessage(phoneNumber, message, options = {}) {
  try {
    const { isAudioMessage = false, mediaUrl = null } = options;
    
    let finalMessage = message;
    
    // Si es mensaje de audio, transcribir primero
    if (isAudioMessage && mediaUrl) {
      console.log('🎤 Procesando mensaje de audio...');
      const transcription = await transcriptionService.transcribeAudio(mediaUrl);
      
      if (transcription.success) {
        finalMessage = transcription.text;
        console.log(`📝 Audio transcrito: "${finalMessage}"`);
      } else {
        // Si falla la transcripción, responder pidiendo texto
        return {
          success: true,
          response: {
            type: 'transcription_error',
            message: transcription.fallbackMessage || 'No pude entender el audio, ¿puedes escribirme qué necesitas?',
            waitingFor: 'consulta_general',
            shouldRespondWithAudio: false // Forzar respuesta en texto
          }
        };
      }
    }
    
    logConversation(phoneNumber, finalMessage, 'user');
    
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
    
    // Guardar información sobre el tipo de mensaje
    leadData.lastUserMessage = finalMessage;
    leadData.lastMessageWasAudio = isAudioMessage;
    
    // Procesar mensaje con el motor conversacional
    const response = await vehicleConversationEngine.processResponse(finalMessage, leadData);
    
    // Determinar si responder con audio
    response.shouldRespondWithAudio = isAudioMessage; // Responder en el mismo formato
    
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
          waitingFor: 'consulta_general',
          shouldRespondWithAudio: false
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
      const messageType = data.type;
      const mediaUrl = data.media;
      
      const isAudioMessage = messageType === 'ptt' || messageType === 'audio';
      
      // Verificar si el número está autorizado
      if (!AUTHORIZED_NUMBERS.includes(phoneNumber)) {
        console.log(`🚫 NÚMERO NO AUTORIZADO: ${phoneNumber}`);
        res.status(200).json({ success: true, message: 'Número no autorizado' });
        return;
      }
      
      if (isAudioMessage && mediaUrl) {
        console.log(`🎙️ MENSAJE DE AUDIO de ${phoneNumber}: ${mediaUrl}`);
      } else if (userMessage) {
        console.log(`📱 MENSAJE DE TEXTO de ${phoneNumber}: ${userMessage}`);
      } else {
        console.log(`📭 MENSAJE VACÍO de ${phoneNumber}`);
        res.status(200).json({ success: true });
        return;
      }
      
      // Verificar si hay una conversación activa
      let conversation = activeConversations.get(phoneNumber) || {
        messages: [],
        lastActivity: new Date(),
        isProcessing: false
      };
      
      // Agregar mensaje a la cola
      conversation.messages.push({
        text: userMessage,
        isAudio: isAudioMessage,
        mediaUrl: mediaUrl,
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
              // Tomar el último mensaje
              const lastMessage = conv.messages[conv.messages.length - 1];
              conv.messages = []; // Limpiar mensajes procesados
              
              // Procesar mensaje
              const result = await processUserMessage(phoneNumber, lastMessage.text, {
                isAudioMessage: lastMessage.isAudio,
                mediaUrl: lastMessage.mediaUrl
              });
              
              if (result.success) {
                const shouldUseAudio = result.response.shouldRespondWithAudio !== false;
                
                // Manejar envío de imágenes
                if (result.response.type === 'send_images') {
                  // Primero enviar el mensaje de texto
                  await sendWhatsAppMessage(phoneNumber, result.response.message, {
                    messageType: 'product_info',
                    sendAsAudio: shouldUseAudio
                  });
                  
                  // Luego enviar imágenes si hay referencia de vehículo
                  if (result.response.vehicleReference) {
                    const vehicle = await inventoryService.getVehicleByReference(result.response.vehicleReference);
                    if (vehicle && vehicle.ImagenesArray) {
                      const imageResult = await imageService.sendVehicleImages(phoneNumber, vehicle, 3);
                      if (imageResult.success) {
                        console.log(`📸 ${imageResult.totalSent} imágenes enviadas del ${vehicle.Marca} ${vehicle.Modelo}`);
                      } else {
                        // Si falla el envío de imágenes, informar al usuario
                        await sendWhatsAppMessage(phoneNumber, "Uy, tuve problemas enviando las fotos. ¿Te parece si me escribes y te cuento más detalles?", {
                          messageType: 'error',
                          sendAsAudio: false
                        });
                      }
                    } else {
                      // Si no hay referencia específica, preguntar cuál vehículo
                      await sendWhatsAppMessage(phoneNumber, "¿De cuál vehículo quieres ver las fotos? Pásame la referencia.", {
                        messageType: 'consultation',
                        sendAsAudio: shouldUseAudio
                      });
                    }
                  } else {
                    // Si no hay referencia específica, preguntar cuál vehículo
                    await sendWhatsAppMessage(phoneNumber, "¿De cuál vehículo quieres ver las fotos? Pásame la referencia.", {
                      messageType: 'consultation',
                      sendAsAudio: shouldUseAudio
                    });
                  }
                } else {
                  // Manejo normal de otros tipos de respuesta
                  await sendWhatsAppMessage(phoneNumber, result.response.message, {
                    messageType: result.response.type === 'appointment_confirmed' ? 'appointment' : 'product_info',
                    sendAsAudio: shouldUseAudio
                  });
                }
                
                if (result.response.type === 'appointment_confirmed') {
                  console.log(`🎉 ¡CITA AGENDADA! ${phoneNumber}`);
                }
              } else {
                await sendWhatsAppMessage(phoneNumber, result.message, {
                  messageType: 'error',
                  sendAsAudio: false // Errores siempre en texto
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
                sendAsAudio: false
              });
            } catch (sendError) {
              console.error('Error enviando mensaje de error:', sendError);
            }
          }
        }, 1000); // Reducir delay a 1 segundo
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
    
    // Mensaje inicial más natural y personalizado (CORTO)
    const initialMessage = `¡Ey! ¿Qué tal? Soy Carlos del concesionario 👋

¿Andas buscando carro?`;

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
        models: inventory.models,
        types: inventory.types,
        colors: inventory.colors,
        transmissions: inventory.transmissions
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
      types: testResult.types || [],
      hasImages: testResult.hasImages || false,
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
 
 // Endpoint para ajustar configuración de voz
 app.post('/admin/voice-config', async (req, res) => {
  try {
    const { voiceId, stability, similarity_boost, style } = req.body;
    
    if (voiceId) {
      elevenLabsService.setVoice(voiceId);
    }
    
    if (stability !== undefined || similarity_boost !== undefined || style !== undefined) {
      const newSettings = {};
      if (stability !== undefined) newSettings.stability = stability;
      if (similarity_boost !== undefined) newSettings.similarity_boost = similarity_boost;
      if (style !== undefined) newSettings.style = style;
      
      elevenLabsService.updateVoiceSettings(newSettings);
    }
    
    res.json({
      success: true,
      message: 'Configuración de voz actualizada',
      currentVoice: elevenLabsService.defaultVoiceId,
      currentSettings: elevenLabsService.voiceSettings
   });
 } catch (error) {
   res.status(500).json({ error: error.message });
 }
 });
 
 // Endpoint para probar calidad de voz
 app.post('/admin/test-voice', async (req, res) => {
 try {
   const { text, messageType } = req.body;
   
   const testText = text || "¡Hola! Esta es una prueba de la voz mejorada de Carlos. ¿Se escucha natural y menos robótica?";
   const analyzedTone = elevenLabsService.analyzeMessageTone(testText);
   const finalMessageType = messageType || analyzedTone;
   
   console.log(`🎭 Probando voz con tono: ${finalMessageType}`);
   
   const voiceConfig = elevenLabsService.getVoiceForMessageType(finalMessageType);
   const result = await elevenLabsService.textToSpeech(testText, voiceConfig);
   
   if (result.success) {
     // Programar eliminación después de 10 minutos
     setTimeout(async () => {
       try {
         await gcsService.deleteAudio(result.fileName);
       } catch (e) {
         console.log('No se pudo eliminar archivo de prueba');
       }
     }, 10 * 60 * 1000);
   }
   
   res.json({
     success: result.success,
     audioUrl: result.publicUrl,
     detectedTone: analyzedTone,
     usedTone: finalMessageType,
     voiceSettings: voiceConfig.voiceSettings,
     text: testText,
     error: result.error
   });
 } catch (error) {
   res.status(500).json({ error: error.message });
 }
 });
 
 // Endpoint para obtener configuración actual de voz
 app.get('/admin/voice-config', (req, res) => {
 try {
   res.json({
     success: true,
     currentVoice: elevenLabsService.defaultVoiceId,
     currentSettings: elevenLabsService.voiceSettings,
     availableTones: [
       'greeting',
       'product_info', 
       'appointment',
       'error',
       'enthusiasm',
       'consultation'
     ]
   });
 } catch (error) {
   res.status(500).json({ error: error.message });
 }
 });
 
 // Endpoint para probar envío de imágenes
 app.post('/admin/test-images', async (req, res) => {
  try {
    const { phoneNumber, vehicleReference } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Número de teléfono requerido' });
    }
    
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    
    if (vehicleReference) {
      // Probar con vehículo específico
      const vehicle = await inventoryService.getVehicleByReference(vehicleReference);
      if (!vehicle) {
        return res.status(404).json({ error: 'Vehículo no encontrado' });
      }
      
      const result = await imageService.sendVehicleImages(normalizedPhone, vehicle);
      res.json({
        success: result.success,
        message: `${result.totalSent || 0} imágenes enviadas`,
        vehicle: {
          referencia: vehicle.Referencia_Vehiculo,
          marca: vehicle.Marca,
          modelo: vehicle.Modelo
        },
        result: result
      });
    } else {
      // Prueba con imagen de demo
      const result = await imageService.testImageSend(normalizedPhone);
      res.json({
        success: result.success,
        message: 'Imagen de prueba enviada',
        result: result
      });
    }
    
  } catch (error) {
    console.error('Error probando imágenes:', error);
    res.status(500).json({ error: 'Error probando imágenes' });
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
     types: inventory.types ? inventory.types.length : 0,
     withImages: inventory.vehicles.filter(v => v.ImagenesArray && v.ImagenesArray.length > 0).length,
     lastUpdate: inventory.lastUpdate
   } : { totalVehicles: 0, brands: 0, types: 0, withImages: 0, lastUpdate: null };
   
   // Estadísticas de mensajes de audio vs texto
   const audioStats = {
     totalConversations: leads.length,
     conversationsWithAudio: leads.filter(l => 
       l.proceso?.conversacion_historial?.some(conv => conv.was_audio)
     ).length
   };
   
   res.json({
     leads: leadStats,
     inventory: inventoryStats,
     audio: audioStats,
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
       totalVehicles: inventoryHealth.totalVehicles || 0,
       hasImages: inventoryHealth.hasImages || false
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
       ready: !!process.env.ELEVENLABS_API_KEY,
       currentVoice: elevenLabsService.defaultVoiceId,
       voiceSettings: elevenLabsService.voiceSettings
     },
     gcs: {
       configured: gcsHealth.success,
       ready: gcsHealth.success,
       bucket: gcsHealth.bucket || null,
       folder: gcsHealth.folder || null
     },
     transcription: {
       configured: !!process.env.OPENAI_API_KEY,
       ready: !!process.env.OPENAI_API_KEY
     },
     images: {
       configured: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID),
       ready: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID)
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
     version: '2.1-enhanced-images'
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
 
 // Endpoint para análisis de tono de mensajes
 app.post('/admin/analyze-tone', (req, res) => {
 try {
   const { message } = req.body;
   
   if (!message) {
     return res.status(400).json({ error: 'Mensaje requerido' });
   }
   
   const analyzedTone = elevenLabsService.analyzeMessageTone(message);
   const voiceConfig = elevenLabsService.getVoiceForMessageType(analyzedTone);
   
   res.json({
     success: true,
     message: message,
     detectedTone: analyzedTone,
     voiceConfig: voiceConfig,
     explanation: {
       greeting: "Para saludos cálidos y amigables",
       product_info: "Para información de productos balanceada", 
       appointment: "Para confirmaciones de citas entusiastas",
       error: "Para mensajes de error calmados",
       enthusiasm: "Para momentos de emoción y entusiasmo",
       consultation: "Para consultas técnicas profesionales"
     }[analyzedTone] || "Configuración por defecto"
   });
 } catch (error) {
   res.status(500).json({ error: error.message });
 }
 });
 
 // Endpoint para obtener detalles de vehículo con imágenes
 app.get('/vehicle/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const vehicleDetails = await inventoryService.getVehicleDetails(reference);
    
    if (vehicleDetails.success) {
      res.json({
        success: true,
        vehicle: vehicleDetails.vehicle
      });
    } else {
      res.status(404).json({
        success: false,
        error: vehicleDetails.message || 'Vehículo no encontrado'
      });
    }
  } catch (error) {
    console.error('Error obteniendo detalles del vehículo:', error);
    res.status(500).json({ error: 'Error obteniendo detalles del vehículo' });
  }
 });
 
 // Endpoint para estadísticas avanzadas del inventario
 app.get('/inventory/stats', async (req, res) => {
  try {
    const stats = await inventoryService.getInventoryStats();
    
    if (stats.success) {
      res.json({
        success: true,
        stats: stats.stats
      });
    } else {
      res.status(500).json({
        success: false,
        error: stats.error
      });
    }
  } catch (error) {
    console.error('Error obteniendo estadísticas del inventario:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas del inventario' });
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
 console.log('🎙️ ENDPOINTS DE VOZ:');
 console.log(`🎛️ Configurar voz: POST ${PORT}/admin/voice-config`);
 console.log(`📊 Ver configuración: GET ${PORT}/admin/voice-config`);
 console.log(`🎤 Probar voz: POST ${PORT}/admin/test-voice`);
 console.log(`🎭 Analizar tono: POST ${PORT}/admin/analyze-tone`);
 console.log('');
 console.log('📸 ENDPOINTS DE IMÁGENES:');
 console.log(`🖼️ Probar imágenes: POST ${PORT}/admin/test-images`);
 console.log(`🚗 Detalles vehículo: GET ${PORT}/vehicle/{reference}`);
 console.log(`📊 Stats inventario: GET ${PORT}/inventory/stats`);
 console.log('');
 console.log('🎯 BOT PARA COMPRA-VENTA DE VEHÍCULOS v2.1-IMAGES-ENHANCED');
 console.log('💡 Funcionalidades:');
 console.log('   🗣️ Conversaciones súper naturales con Carlos');
 console.log('   📋 Consulta de inventario desde Google Sheets');
 console.log('   🤖 IA conversacional avanzada con Claude');
 console.log('   📅 Agendamiento de citas intuitivo');
 console.log('   📧 Notificaciones automáticas por email');
 console.log('   📊 Registro de leads en Google Sheets');
 console.log('   💬 Manejo inteligente de errores');
 console.log('   🧠 Memoria conversacional');
 console.log('   🎙️ Mensajes de voz naturales con ElevenLabs');
 console.log('   ☁️ Almacenamiento de audio en Google Cloud Storage');
 console.log('   🎤 Transcripción de audios con Whisper');
 console.log('   🔄 Detección automática de formato de mensaje');
 console.log('   🎭 Análisis de tono automático para voz natural');
 console.log('   🎛️ Configuración dinámica de parámetros de voz');
 console.log('   🔊 Respuesta en mismo formato (audio por audio)');
 console.log('   📸 Envío automático de imágenes de vehículos');
 console.log('   🖼️ Soporte para múltiples imágenes por vehículo');
 console.log('   🎯 Detección inteligente de solicitudes de imágenes');
 console.log('   📝 Captions personalizados para cada imagen');
 console.log('='.repeat(60));
 console.log('🎉 ¡Listo para conversaciones naturales con audio e imágenes!');
 console.log('='.repeat(60) + '\n');
 
 // Mostrar configuración actual de voz
 console.log('🎤 CONFIGURACIÓN ACTUAL DE VOZ:');
 console.log(`   Voice ID: ${elevenLabsService.defaultVoiceId}`);
 console.log(`   Stability: ${elevenLabsService.voiceSettings.stability}`);
 console.log(`   Similarity Boost: ${elevenLabsService.voiceSettings.similarity_boost}`);
 console.log(`   Style: ${elevenLabsService.voiceSettings.style}`);
 console.log(`   Speaker Boost: ${elevenLabsService.voiceSettings.use_speaker_boost}`);
 console.log('');
 console.log('📝 PARA MEJORAR LA VOZ:');
 console.log(`   POST ${PORT}/admin/voice-config`);
 console.log('   Body: { "stability": 0.6, "similarity_boost": 0.7, "style": 0.4 }');
 console.log('');
 console.log('🎭 TONOS DISPONIBLES:');
 console.log('   • greeting - Saludos cálidos');
 console.log('   • product_info - Información balanceada');
 console.log('   • appointment - Confirmaciones entusiastas');
 console.log('   • error - Mensajes de error calmados');
 console.log('   • enthusiasm - Momentos de emoción');
 console.log('   • consultation - Consultas técnicas');
 console.log('');
 console.log('📸 COMANDOS DE PRUEBA PARA IMÁGENES:');
 console.log(`   curl -X POST ${PORT}/admin/test-images -H "Content-Type: application/json" -d '{"phoneNumber": "3183351733"}'`);
 console.log(`   curl -X POST ${PORT}/admin/test-images -H "Content-Type: application/json" -d '{"phoneNumber": "3183351733", "vehicleReference": "VEH001"}'`);
 console.log('='.repeat(60) + '\n');
 });