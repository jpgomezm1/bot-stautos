const axios = require('axios');
const FormData = require('form-data');

class TranscriptionService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  async transcribeAudio(audioUrl) {
    try {
      console.log('🎤 Transcribiendo audio:', audioUrl);
      
      // Descargar el audio
      const audioResponse = await axios.get(audioUrl, {
        responseType: 'stream',
        timeout: 30000
      });

      // Crear FormData para Whisper
      const formData = new FormData();
      formData.append('file', audioResponse.data, {
        filename: 'audio.m4a',
        contentType: 'audio/m4a'
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'es');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            ...formData.getHeaders(),
          },
          timeout: 30000,
        }
      );

      const transcription = response.data.text.trim();
      console.log('✅ Audio transcrito:', transcription);
      
      return {
        success: true,
        text: transcription
      };

    } catch (error) {
      console.error('❌ Error transcribiendo audio:', error.message);
      return {
        success: false,
        error: error.message,
        fallbackMessage: 'No pude entender el audio, ¿puedes escribirme qué necesitas?'
      };
    }
  }
}

module.exports = { TranscriptionService };