const { ElevenLabsService } = require('./services/elevenLabsService');

async function testVoiceQuality() {
  console.log('🎤 PROBANDO CALIDAD DE VOZ MEJORADA');
  console.log('='.repeat(50));
  
  const elevenLabs = new ElevenLabsService();
  
  const testMessages = [
    {
      text: "¡Ey! ¿Qué tal? Soy Carlos del concesionario. Me da mucho gusto saludarte.",
      type: "greeting"
    },
    {
      text: "Te tengo una Toyota Hilux 2018 espectacular con apenas 44 mil kilómetros. Está como nueva, perfecta si buscas algo robusto y confiable.",
      type: "product_info"
    },
    {
      text: "¡Perfecto! Entonces confirmamos la cita para mañana a las 3 de la tarde. Te va a encantar cuando veas el carro.",
      type: "appointment"
    },
    {
      text: "Disculpa, tuve un pequeño problema técnico. ¿Me repites por favor?",
      type: "error"
    }
  ];
  
  for (const [index, testCase] of testMessages.entries()) {
    console.log(`\n${index + 1}. Probando: ${testCase.type}`);
    console.log(`   Texto: "${testCase.text.substring(0, 50)}..."`);
    
    const voiceConfig = elevenLabs.getVoiceForMessageType(testCase.type);
    console.log(`   Configuración:`, voiceConfig.voiceSettings);
    
    const result = await elevenLabs.textToSpeech(testCase.text, voiceConfig);
    
    if (result.success) {
      console.log(`   ✅ Audio generado: ${result.publicUrl}`);
      console.log(`   📁 Tamaño: ${(result.size / 1024).toFixed(1)} KB`);
    } else {
      console.log(`   ❌ Error: ${result.error}`);
    }
    
    // Esperar un poco entre pruebas
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🎉 Pruebas completadas. ¡Escucha los audios para comparar calidad!');
}

if (require.main === module) {
  testVoiceQuality().catch(console.error);
}

module.exports = { testVoiceQuality };