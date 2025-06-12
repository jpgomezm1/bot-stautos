// test-gcs-audio.js
const axios = require('axios');

const NGROK_URL = 'https://abd3c260797c.ngrok.app';
const AUTHORIZED_NUMBER = '573183351733';

async function testGCSAudio() {
  console.log('☁️ PRUEBA DE AUDIO CON GOOGLE CLOUD STORAGE');
  console.log('=' .repeat(60));
  
  try {
    // 1. Probar conexión GCS
    console.log('1️⃣ Probando GCS...');
    const gcsTest = await axios.get(`${NGROK_URL}/admin/test-gcs`);
    console.log('✅ GCS:', gcsTest.data);
    
    // 2. Generar y subir audio
    console.log('\n2️⃣ Probando audio con GCS...');
    const audioTest = await axios.get(`${NGROK_URL}/admin/test-audio`);
    console.log('✅ Audio + GCS:', audioTest.data);
    
    // 3. Listar audios en bucket
    console.log('\n3️⃣ Audios en bucket...');
    const audiosList = await axios.get(`${NGROK_URL}/admin/gcs-audios`);
    console.log('📁 Archivos:', audiosList.data);
    
    // 4. Iniciar conversación
    console.log('\n4️⃣ Iniciando conversación...');
    const conversation = await axios.post(`${NGROK_URL}/start-conversation`, {
      phoneNumber: AUTHORIZED_NUMBER
    });
    console.log('✅ Conversación:', conversation.data);
    
    console.log('\n🎉 ¡AUDIO CON GCS CONFIGURADO!');
    console.log('☁️ Los audios se suben automáticamente a Google Cloud Storage');
    console.log('🌐 URLs públicas desde storage.googleapis.com');
    console.log('🗑️ Limpieza automática cada 6 horas');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testGCSAudio();