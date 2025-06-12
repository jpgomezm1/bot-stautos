const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GCSService } = require('./gcsService');

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    // Usar una voz más natural - estas son voces premium de ElevenLabs
    this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam (inglés)
    // Mejores voces para español (si tienes acceso):
    // 'XrExE9yKIg1WjnnlVkGX' - Matilda (muy natural)
    // 'ErXwobaYiN019PkySvjV' - Antoni (masculina, natural)
    // 'VR6AewLTigWG4xSOukaG' - Arnold (profunda, confiable)
    
    // Configuración de voz mucho más natural
    this.voiceSettings = {
      stability: 0.65,        // Reducido para más naturalidad (era 0.75)
      similarity_boost: 0.75, // Reducido para menos artificialidad (era 0.85) 
      style: 0.35,           // Aumentado para más expresividad (era 0.20)
      use_speaker_boost: true,
      optimize_streaming_latency: 0 // Para mejor calidad
    };
    
    // Directorio temporal local
    this.tempDir = path.join(__dirname, '../temp/audios');
    this.ensureTempDir();
    
    // Inicializar servicio de GCS
    this.gcsService = new GCSService();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('📁 Directorio temporal de audios creado');
    }
  }

  async textToSpeech(text, options = {}) {
    try {
      const voiceId = options.voiceId || this.defaultVoiceId;
      const cleanText = this.cleanTextForSpeech(text);
      
      if (cleanText.length === 0) {
        throw new Error('Texto vacío después de limpieza');
      }

      console.log(`🎙️ Generando audio para: "${cleanText.substring(0, 50)}..."`);
      
      // Configuración optimizada para naturalidad
      const requestBody = {
        text: cleanText,
        model_id: 'eleven_multilingual_v2', // Mejor modelo para español
        voice_settings: {
          ...this.voiceSettings,
          ...options.voiceSettings
        },
        // Configuraciones adicionales para más naturalidad
        pronunciation_dictionary_locators: [],
        seed: Math.floor(Math.random() * 1000), // Variabilidad en cada generación
        previous_text: options.previousText || "", // Contexto para continuidad
        next_text: options.nextText || "" // Contexto para mejor entonación
      };
      
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        requestBody,
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          responseType: 'arraybuffer',
          timeout: 45000 // Más tiempo para mejor procesamiento
        }
      );

      // Generar nombre único para el archivo
      const fileName = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const localFilePath = path.join(this.tempDir, fileName);
      
      // Guardar archivo temporalmente
      fs.writeFileSync(localFilePath, response.data);
      
      console.log(`✅ Audio generado localmente: ${fileName} (${response.data.length} bytes)`);
      
      // Subir a Google Cloud Storage
      const gcsResult = await this.gcsService.uploadAudio(localFilePath, fileName);
      
      // Eliminar archivo temporal local inmediatamente
      try {
        fs.unlinkSync(localFilePath);
        console.log(`🗑️ Archivo temporal local eliminado: ${fileName}`);
      } catch (e) {
        console.log('⚠️ No se pudo eliminar archivo temporal local');
      }
      
      if (gcsResult.success) {
        return {
          success: true,
          fileName: fileName,
          publicUrl: gcsResult.publicUrl,
          gcsPath: gcsResult.gcsPath,
          size: response.data.length,
          text: cleanText
        };
      } else {
        throw new Error(`Error subiendo a GCS: ${gcsResult.error}`);
      }

    } catch (error) {
      console.error('❌ Error generando audio:', error.message);
      return {
        success: false,
        error: error.message,
        text: text
      };
    }
  }

  // Mejorar la limpieza de texto para que suene más natural
  cleanTextForSpeech(text) {
    let cleanText = text
      // Remover emojis
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[•▪▫◦‣⁃]/g, '')
      .replace(/[📋📊📈📉📱💬🚗🎯💡🔧⚠️✅❌🔍📞🏠📝📅🎉🤝🤖]/g, '')
      
      // Mejorar formato para lectura natural
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remover markdown bold
      .replace(/\*(.*?)\*/g, '$1')     // Remover markdown italic
      
      // Mejorar pausas y respiración natural
      .replace(/\n\n+/g, '. ') // Dobles saltos = pausa larga
      .replace(/\n/g, ', ')    // Saltos simples = pausa corta
      .replace(/\.\s*\./g, '.') // Eliminar puntos dobles
      .replace(/,\s*,/g, ',')   // Eliminar comas dobles
      .replace(/\s+/g, ' ')     // Espacios múltiples
      .trim();
    
    // Reemplazos específicos para español colombiano
    cleanText = cleanText
      .replace(/\bkm\b/gi, 'kilómetros')
      .replace(/\bm²\b/gi, 'metros cuadrados')
      .replace(/\bRef:\s*/gi, 'referencia ')
      .replace(/\bVEH(\d+)/gi, 'vehículo $1')
      .replace(/\bAM\b/gi, 'de la mañana')
      .replace(/\bPM\b/gi, 'de la tarde')
      .replace(/\$(\d+)/g, '$1 pesos') // Precios
      
      // Mejorar expresiones para audio
      .replace(/😊/g, '') // Remover caritas
      .replace(/👋/g, '') // Remover manos
      .replace(/¿cierto\?/gi, '¿cierto?') // Entonación de pregunta
      .replace(/¿verdad\?/gi, '¿verdad?') // Entonación de pregunta
      
      // Añadir pausas naturales en lugares apropiados
      .replace(/\bpero\b/gi, ', pero')
      .replace(/\bademás\b/gi, ', además')
      .replace(/\bentonces\b/gi, ', entonces')
      .replace(/\by\s+bueno\b/gi, ', y bueno')
      .replace(/\bach[aá]\b/gi, ', acá');
    
    return cleanText;
  }

  // Configuraciones de voz más específicas y naturales
  getVoiceForMessageType(messageType) {
    const baseSettings = { ...this.voiceSettings };
    
    const voiceConfigs = {
      greeting: {
        voiceSettings: { 
          ...baseSettings, 
          style: 0.45,        // Más expresivo para saludos
          stability: 0.60,    // Menos estable = más natural
          similarity_boost: 0.70 // Menos artificial
        }
      },
      product_info: {
        voiceSettings: { 
          ...baseSettings, 
          style: 0.30,        // Informativo pero natural
          stability: 0.70,    // Más estable para información
          similarity_boost: 0.75
        }
      },
      appointment: {
        voiceSettings: { 
          ...baseSettings, 
          style: 0.40,        // Entusiasta para citas
          stability: 0.65,    // Balance
          similarity_boost: 0.70
        }
      },
      error: {
        voiceSettings: { 
          ...baseSettings, 
          style: 0.25,        // Más calmado para errores
          stability: 0.75,    // Más estable
          similarity_boost: 0.80
        }
      },
      enthusiasm: { // Nueva configuración para momentos de emoción
        voiceSettings: {
          ...baseSettings,
          style: 0.55,        // Muy expresivo
          stability: 0.55,    // Menos estable = más emocionado
          similarity_boost: 0.65
        }
      },
      consultation: { // Para consultas técnicas
        voiceSettings: {
          ...baseSettings,
          style: 0.25,        // Más profesional
          stability: 0.75,    // Estable
          similarity_boost: 0.80
        }
      }
    };

    return voiceConfigs[messageType] || voiceConfigs.product_info;
  }

  // Método para seleccionar tipo de voz basado en el contenido
  analyzeMessageTone(message) {
    const lowerMessage = message.toLowerCase();
    
    // Detectar entusiasmo
    if (lowerMessage.includes('¡') || lowerMessage.includes('genial') || 
        lowerMessage.includes('perfecto') || lowerMessage.includes('excelente') ||
        lowerMessage.includes('¡qué') || lowerMessage.includes('increíble')) {
      return 'enthusiasm';
    }
    
    // Detectar saludo
    if (lowerMessage.includes('hola') || lowerMessage.includes('buenas') ||
        lowerMessage.includes('qué tal') || lowerMessage.includes('ey!')) {
      return 'greeting';
    }
    
    // Detectar cita/agenda
    if (lowerMessage.includes('cita') || lowerMessage.includes('agenda') ||
        lowerMessage.includes('confirmo') || lowerMessage.includes('perfecto')) {
      return 'appointment';
    }
    
    // Detectar consulta técnica
    if (lowerMessage.includes('referencia') || lowerMessage.includes('kilómetros') ||
        lowerMessage.includes('precio') || lowerMessage.includes('especificaciones')) {
      return 'consultation';
    }
    
    return 'product_info'; // Default
  }

  async testConnection() {
    try {
      // Probar ElevenLabs con un texto optimizado
      const testText = "Hola, esta es una prueba de la voz mejorada de Carlos. ¿Se escucha natural?";
      const messageType = this.analyzeMessageTone(testText);
      const voiceConfig = this.getVoiceForMessageType(messageType);
      
      const result = await this.textToSpeech(testText, voiceConfig);
      
      if (result.success) {
        // Programar eliminación del archivo de prueba
        setTimeout(async () => {
          try {
            await this.gcsService.deleteAudio(result.fileName);
          } catch (e) {
            console.log('No se pudo eliminar archivo de prueba de GCS');
          }
        }, 10000); // 10 segundos
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Método para cambiar la voz principal (útil para diferentes personas)
  setVoice(voiceId) {
    this.defaultVoiceId = voiceId;
    console.log(`🎤 Voz cambiada a: ${voiceId}`);
  }

  // Método para ajustar configuración global de voz
  updateVoiceSettings(newSettings) {
    this.voiceSettings = {
      ...this.voiceSettings,
      ...newSettings
    };
    console.log('🎛️ Configuración de voz actualizada:', this.voiceSettings);
  }
}

module.exports = { ElevenLabsService };