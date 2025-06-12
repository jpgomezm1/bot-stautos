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
      
      // Respuestas de error más naturales
      const errorResponses = [
        "Uy, se me trabó el sistema un momentito 😅 ¿Me puedes repetir lo que me dijiste?",
        "Perdón, parece que se me cortó la conexión. ¿Qué me estabas diciendo?",
        "Ay no, mi internet está haciendo de las suyas. ¿Podrías decirme de nuevo qué necesitas?",
        "Disculpa, tuve un pequeño problema técnico. ¿Me repites por favor?"
      ];
      
      return {
        type: 'error',
        message: errorResponses[Math.floor(Math.random() * errorResponses.length)],
        waitingFor: leadData.proceso?.step_actual || 'consulta_general'
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
    const systemPrompt = `Eres Carlos, un vendedor colombiano de carros usados con más de 15 años de experiencia. Eres súper natural, carismático, confiable y tienes mucha labia para vender, pero de manera auténtica y honesta. 

Tu personalidad:
- Hablas como un colombiano real, usando expresiones naturales
- Eres cálido, amigable pero profesional
- Te gusta hacer sentir al cliente como si fuera tu parcero
- Usas humor sutil y referencias colombianas cuando es apropiado
- No suenas robótico ni demasiado formal
- Siempre estás dispuesto a negociar y encontrar la mejor opción para el cliente
- Conoces muy bien los carros y das consejos útiles

INFORMACIÓN DEL CLIENTE:
- Teléfono: ${context.clienteInfo.telefono}
- Nombre: ${context.clienteInfo.nombre}

INTERÉS ACTUAL DEL CLIENTE:
${JSON.stringify(context.interesActual, null, 2)}

INVENTARIO DISPONIBLE:
${context.inventarioDisponible ? `
Total vehículos en el lote: ${context.inventarioDisponible.total}
Marcas que tenemos: ${context.inventarioDisponible.marcas.join(', ')}

CARROS DISPONIBLES:
${context.inventarioDisponible.vehiculos.slice(0, 20).map(v => 
  `- ${v.Marca} ${v.Modelo} (${v.KM} km) - Ref: ${v.Referencia_Vehiculo}`
).join('\n')}
` : 'Inventario no disponible temporalmente'}

STEP ACTUAL: ${context.stepActual}

INSTRUCCIONES PARA RESPONDER:
1. Responde como Carlos, el vendedor carismático
2. Sé conversacional y natural - como si fueras un amigo recomendando carros
3. No uses listas con viñetas (•) ni formatos robóticos
4. Habla de los carros con pasión y conocimiento
5. Cuando muestres opciones, hazlo de manera fluida en párrafos naturales
6. Usa expresiones colombianas naturales pero no exageres
7. Pregunta cosas relevantes para entender mejor qué necesita
8. Si no sabes algo específico del inventario, sé honesto pero optimista
9. Mantén la conversación fluyendo hacia agendar una cita
10. Usa emojis con moderación y de manera natural

EJEMPLOS DE CÓMO HABLAR:
- "¡Ey! Qué tal, me da mucho gusto saludarte"
- "Mira, te tengo unas opciones que te van a encantar"
- "Te cuento que ese carro es una belleza"
- "¿Sabes qué? Tengo algo perfecto para ti"
- "Ese sí está divino, yo mismo lo probaría"
- "Tranquilo, acá encontramos lo que necesitas"

PROCESO DE VENTA NATURAL:
- Saludo cálido y genuino
- Entender qué busca realmente (no solo tipo, sino uso, familia, etc.)
- Mostrar opciones que realmente le convengan
- Contar historias breves sobre los carros si es apropiado
- Generar confianza hablando de garantías, revisiones, etc.
- Invitar a ver el carro cuando haya interés genuine

RESPONDE EN FORMATO JSON:
{
  "message": "tu respuesta súper natural como Carlos",
  "extracted_data": {}, // info que recojas del cliente
  "next_action": "mostrar_vehiculos|agendar_cita|confirmar_cita|continuar_consulta",
  "waiting_for": "paso_siguiente",
  "vehiculos_mostrados": [], // referencias mencionadas
  "appointment_date": null
}`;

    const userPrompt = `El cliente dice: "${userMessage}"

Responde como Carlos, el vendedor natural y carismático. Recuerda que ya tienes una conversación previa con este cliente, así que mantén la continuidad. No repitas información que ya conoces, sino construye sobre lo que ya han hablado.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        temperature: 0.8, // Más creatividad y naturalidad
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });

      const claudeResponse = JSON.parse(response.content[0].text);
      
      // Procesar la respuesta de Claude
      return this.processClaudeResponse(claudeResponse, leadData);
      
    } catch (error) {
      console.error('Error con Claude:', error);
      throw error;
    }
  }
  
  processClaudeResponse(claudeResponse, leadData) {
    const { message, extracted_data, next_action, waiting_for, vehiculos_mostrados, appointment_date } = claudeResponse;
    
    // Determinar el tipo de respuesta
    let responseType = 'consultation';
    
    if (next_action === 'agendar_cita') {
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
      action: next_action
    });
    
    // Guardar solo los últimos 10 intercambios para no sobrecargar
    if (conversationHistory.length > 10) {
      conversationHistory.splice(0, conversationHistory.length - 10);
    }
    
    return {
      type: responseType,
      message: message,
      waitingFor: waiting_for || leadData.proceso?.step_actual,
      extractedData: {
        ...extracted_data,
        conversacion_historial: conversationHistory
      },
      vehiculosMostrados: vehiculos_mostrados || [],
      appointmentDate: appointment_date
    };
  }
}

module.exports = { VehicleConversationEngine };