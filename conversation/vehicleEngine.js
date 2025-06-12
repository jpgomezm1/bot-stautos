const Anthropic = require('@anthropic-ai/sdk');
const { InventoryService } = require('../services/inventoryService');

class VehicleConversationEngine {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    this.inventoryService = new InventoryService();
  }
  
  async processResponse(userMessage, leadData) {
    try {
      // Construir contexto de la conversación
      const context = await this.buildConversationContext(leadData);
      
      // Usar Claude para procesar la respuesta de manera natural
      const claudeResponse = await this.getClaudeResponse(userMessage, context, leadData);
      
      return claudeResponse;
    } catch (error) {
      console.error('Error procesando con Claude:', error);
      
      // Respuestas de error más naturales y cortas
      const errorResponses = [
        "Se me trabó un momentito 😅 ¿Me repites?",
        "Perdón, ¿qué me decías?",
        "No te escuché bien, ¿me dices de nuevo?",
        "Disculpa, ¿puedes repetir?"
      ];
      
      return {
        type: 'error',
        message: errorResponses[Math.floor(Math.random() * errorResponses.length)],
        waitingFor: leadData.proceso?.step_actual || 'consulta_general',
        shouldRespondWithAudio: false
      };
    }
  }
  
  async buildConversationContext(leadData) {
    const { cliente, interes, proceso } = leadData;
    
    // Obtener inventario actual
    const inventory = await this.inventoryService.getInventory();
    
    return {
      clienteInfo: {
        telefono: cliente.celular,
        nombre: cliente.nombre || 'Cliente'
      },
      interesActual: interes,
      stepActual: proceso?.step_actual || 'saludo_inicial',
      inventarioDisponible: inventory.success ? {
        vehiculos: inventory.vehicles,
        marcas: inventory.brands,
        modelos: inventory.models,
        total: inventory.vehicles.length
      } : null,
      conversacionPrevia: proceso?.conversacion_historial || []
    };
  }
  
  async getClaudeResponse(userMessage, context, leadData) {
    const systemPrompt = `Eres Carlos, un vendedor de carros colombiano súper natural y relajado. 

REGLAS CRÍTICAS:
- Responde MÁXIMO 2-3 líneas por mensaje
- Haz UNA sola pregunta por vez
- Habla como si fueras un parcero, no un robot
- No uses listas largas ni bullet points
- Mantén el momentum de la conversación
- NUNCA repitas información que ya diste

DETECCIÓN DE SOLICITUDES DE IMÁGENES:
- Si mencionan "fotos", "imágenes", "ver", "mostrar", "cómo se ve", "apariencia", detecta como solicitud de imagen
- Si preguntan por un vehículo específico + quieren verlo, ofrecer imágenes
- Responder con tipo "send_images" cuando detectes solicitud de imágenes
- Si mencionan una referencia específica (VEH001, VEH002, etc.) + solicitud visual, incluir "vehicle_reference"

Tu personalidad:
- Relajado y amigable como un amigo
- Usas expresiones colombianas naturales pero sin exagerar
- Directo pero cálido
- Te enfocas en UNA cosa a la vez

INFORMACIÓN DEL CLIENTE:
- Teléfono: ${context.clienteInfo.telefono}
- Nombre: ${context.clienteInfo.nombre}

INTERÉS ACTUAL DEL CLIENTE:
${JSON.stringify(context.interesActual, null, 2)}

INVENTARIO DISPONIBLE:
${context.inventarioDisponible ? `
Total vehículos: ${context.inventarioDisponible.total}
Marcas disponibles: ${context.inventarioDisponible.marcas.slice(0, 8).join(', ')}

VEHÍCULOS (primeros 8):
${context.inventarioDisponible.vehiculos.slice(0, 8).map(v => 
  `${v.Referencia_Vehiculo}: ${v.Marca} ${v.Modelo} ${v.Año || ''} (${v.KM || v.Kilometraje} km)${v.Precio ? ' - $' + v.Precio : ''}`
).join('\n')}
` : 'Inventario no disponible'}

STEP ACTUAL: ${context.stepActual}

CONVERSACIÓN RECIENTE:
${context.conversacionPrevia.length > 0 ? 
  context.conversacionPrevia.slice(-2).map(conv => 
    `Usuario: ${conv.user_message}\nCarlos: ${conv.bot_response}`
  ).join('\n\n') : 
  'Primera interacción'
}

EJEMPLOS DE DETECCIÓN DE IMÁGENES:
- "¿Puedes mostrarme fotos del Toyota?" → next_action: "send_images", image_request: true
- "Quiero ver cómo se ve el VEH001" → next_action: "send_images", vehicle_reference: "VEH001", image_request: true
- "¿Tienes imágenes de ese carro?" → next_action: "send_images", image_request: true
- "Me gustaría ver el interior" → next_action: "send_images", image_request: true

FLUJO NATURAL:
1. Saludo súper corto
2. Una pregunta simple 
3. Escuchar respuesta
4. Hacer siguiente pregunta según respuesta
5. Mostrar máximo 2-3 opciones específicas
6. Si piden imágenes, confirmar y enviar

PATRONES DE RESPUESTA:
- Saludo inicial: "¡Ey! ¿Qué tal? Soy Carlos 👋 ¿Andas buscando carro?"
- Pregunta marca: "¿Qué marca te gusta más?"
- Mostrar opción: "Tengo un Toyota RAV4 que está divino. ¿Te interesa?"
- Presupuesto: "¿En qué rango de precio andas pensando?"
- Agendar: "¿Cuándo podrías venir a verlo?"
- Imágenes: "¡Claro! Te mando las fotos del [vehículo]"

RESPONDE ESTRICTAMENTE EN ESTE JSON:
{
  "message": "respuesta súper corta y natural (máximo 150 caracteres)",
  "extracted_data": {},
  "next_action": "mostrar_vehiculos|agendar_cita|confirmar_cita|send_images|continuar_consulta",
  "waiting_for": "paso_siguiente",
  "vehiculos_mostrados": [],
  "appointment_date": null,
  "vehicle_reference": null,
  "image_request": false
}`;

    const userPrompt = `El cliente dice: "${userMessage}"

Responde como Carlos de manera súper natural y corta. Mantén la continuidad pero NO repitas lo que ya dijiste antes.

IMPORTANTE: Si detectas solicitud de imágenes, marca image_request: true y next_action: "send_images". Si mencionan referencia específica de vehículo, incluye vehicle_reference.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        temperature: 0.8,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });

      let responseText = response.content[0].text.trim();
      
      // Limpiar el texto para asegurar JSON válido
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Buscar el JSON en el texto
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseText = jsonMatch[0];
      }

      // Validar que sea JSON válido antes de parsear
      let claudeResponse;
      try {
        claudeResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parseando JSON de Claude:', parseError);
        console.error('Respuesta recibida:', responseText);
        
        // Crear respuesta de fallback corta
        claudeResponse = {
          message: "No te escuché bien, ¿me repites?",
          extracted_data: {},
          next_action: "continuar_consulta",
          waiting_for: "consulta_general",
          vehiculos_mostrados: [],
          appointment_date: null,
          vehicle_reference: null,
          image_request: false
        };
      }

      // Validar longitud del mensaje
      if (claudeResponse.message && claudeResponse.message.length > 200) {
        claudeResponse.message = this.shortenMessage(claudeResponse.message);
      }
      
      // Procesar la respuesta de Claude
      return this.processClaudeResponse(claudeResponse, leadData);
      
    } catch (error) {
      console.error('Error con Claude:', error);
      throw error;
    }
  }
  
  shortenMessage(longMessage) {
    const sentences = longMessage.split('. ');
    
    // Si es muy largo, usar solo la primera oración + una pregunta
    if (longMessage.length > 200) {
      const firstSentence = sentences[0];
      const hasQuestion = longMessage.includes('?');
      
      if (hasQuestion) {
        // Encontrar la pregunta más corta
        const questions = longMessage.split('?').filter(q => q.trim());
        const shortestQuestion = questions.reduce((a, b) => a.length <= b.length ? a : b);
        return `${firstSentence}. ${shortestQuestion.trim()}?`;
      } else {
        return `${firstSentence}. ¿Qué opinas?`;
      }
    }
    
    return longMessage;
  }
  
  processClaudeResponse(claudeResponse, leadData) {
    const { message, extracted_data, next_action, waiting_for, vehiculos_mostrados, appointment_date, vehicle_reference, image_request } = claudeResponse;
    
    // Determinar el tipo de respuesta
    let responseType = 'consultation';
    
    if (next_action === 'send_images' || image_request) {
      responseType = 'send_images';
    } else if (next_action === 'agendar_cita') {
      responseType = 'schedule_appointment';
    } else if (next_action === 'confirmar_cita' && appointment_date) {
      responseType = 'appointment_confirmed';
    } else if (next_action === 'mostrar_vehiculos') {
      responseType = 'show_vehicles';
    }
    
    // Agregar el mensaje al historial de conversación
    const conversationHistory = leadData.proceso?.conversacion_historial || [];
    conversationHistory.push({
      timestamp: new Date(),
      user_message: leadData.lastUserMessage || '',
      bot_response: message,
      action: next_action,
      was_audio: leadData.lastMessageWasAudio || false
    });
    
    // Guardar solo los últimos 10 intercambios para mantener conversaciones cortas
    if (conversationHistory.length > 10) {
      conversationHistory.splice(0, conversationHistory.length - 10);
    }
    
    // Extraer información adicional del mensaje del usuario si es relevante
    const additionalData = this.extractAdditionalData(leadData.lastUserMessage || '', extracted_data);
    
    return {
      type: responseType,
      message: message,
      waitingFor: waiting_for || leadData.proceso?.step_actual,
      extractedData: {
        ...additionalData,
        ...extracted_data,
        conversacion_historial: conversationHistory
      },
      vehiculosMostrados: vehiculos_mostrados || [],
      appointmentDate: appointment_date,
      vehicleReference: vehicle_reference,
      shouldRespondWithAudio: leadData.lastMessageWasAudio
    };
  }
  
  extractAdditionalData(userMessage, existingData) {
    const lowerMessage = userMessage.toLowerCase();
    const additionalData = { ...existingData };
    
    // Extraer marcas mencionadas
    const commonBrands = ['toyota', 'chevrolet', 'nissan', 'hyundai', 'kia', 'mazda', 'volkswagen', 'ford', 'honda', 'suzuki', 'mitsubishi', 'renault'];
    const mentionedBrands = commonBrands.filter(brand => lowerMessage.includes(brand));
    
    if (mentionedBrands.length > 0 && !additionalData.marca_interes) {
      additionalData.marca_interes = mentionedBrands[0].charAt(0).toUpperCase() + mentionedBrands[0].slice(1);
    }
    
    // Extraer tipos de vehículo
    const vehicleTypes = {
      'suv': 'SUV',
      'sedan': 'Sedan',
      'camioneta': 'Camioneta',
      'hatchback': 'Hatchback',
      'pickup': 'Pickup',
      'familiar': 'Familiar'
    };
    
    for (const [key, value] of Object.entries(vehicleTypes)) {
      if (lowerMessage.includes(key) && !additionalData.tipo_vehiculo) {
        additionalData.tipo_vehiculo = value;
        break;
      }
    }
    
    // Extraer presupuesto aproximado
    const budgetMatch = userMessage.match(/(\d+)\s*(millones?|mill)/i);
   if (budgetMatch && !additionalData.presupuesto_max) {
     const amount = parseInt(budgetMatch[1]) * 1000000;
     additionalData.presupuesto_max = amount;
   }
   
   // Detectar uso del vehículo
   const usagePatterns = {
     'trabajo': 'Trabajo',
     'familia': 'Familiar',
     'finca': 'Campo/Finca',
     'cargar': 'Carga',
     'personal': 'Personal'
   };
   
   for (const [key, value] of Object.entries(usagePatterns)) {
     if (lowerMessage.includes(key) && !additionalData.uso_vehiculo) {
       additionalData.uso_vehiculo = value;
       break;
     }
   }
   
   // Detectar referencias específicas de vehículos
   const refMatch = userMessage.match(/VEH\d+|REF[\-\s]*\d+/gi);
   if (refMatch && !additionalData.vehiculo_consultado) {
     additionalData.vehiculo_consultado = refMatch[0];
     
     if (!additionalData.vehiculos_consultados) {
       additionalData.vehiculos_consultados = [];
     }
     
     if (!additionalData.vehiculos_consultados.includes(refMatch[0])) {
       additionalData.vehiculos_consultados.push(refMatch[0]);
     }
   }
   
   return additionalData;
 }
}

module.exports = { VehicleConversationEngine };