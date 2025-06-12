const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GCSService } = require('./gcsService');

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
    
    this.voiceSettings = {
      stability: 0.75,
      similarity_boost: 0.85,
      style: 0.20,
      use_speaker_boost: true
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
      
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          text: cleanText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            ...this.voiceSettings,
            ...options.voiceSettings
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          responseType: 'arraybuffer',
          timeout: 30000
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

  // Resto de métodos igual que antes...
  cleanTextForSpeech(text) {
    let cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[•▪▫◦‣⁃]/g, '-')
      .replace(/[📋📊📈📉📱💬🚗🎯💡🔧⚠️✅❌🔍📞🏠📝📅🎉🤝🤖]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\n\n+/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
    
    cleanText = cleanText
      .replace(/\bkm\b/gi, 'kilómetros')
      .replace(/\bm²\b/gi, 'metros cuadrados')
      .replace(/\bRef:\s*/gi, 'referencia ')
      .replace(/\bVEH(\d+)/gi, 'vehículo $1')
      .replace(/\bAM\b/gi, 'de la mañana')
      .replace(/\bPM\b/gi, 'de la tarde');
    
    return cleanText;
  }

  getVoiceForMessageType(messageType) {
    const voiceConfigs = {
      greeting: {
        voiceSettings: { 
          ...this.voiceSettings, 
          style: 0.30,
          stability: 0.80 
        }
      },
      product_info: {
        voiceSettings: { 
          ...this.voiceSettings, 
          style: 0.15,
          stability: 0.85 
        }
      },
      appointment: {
        voiceSettings: { 
          ...this.voiceSettings, 
          style: 0.25,
          stability: 0.75 
        }
      },
      error: {
        voiceSettings: { 
          ...this.voiceSettings, 
          style: 0.10,
          stability: 0.90 
        }
      }
    };

    return voiceConfigs[messageType] || {};
  }

  async testConnection() {
    try {
      // Probar ElevenLabs
      const testText = "Prueba de conexión con Google Cloud Storage";
      const result = await this.textToSpeech(testText);
      
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
}

module.exports = { ElevenLabsService };