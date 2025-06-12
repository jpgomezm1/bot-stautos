// test-vehicle-bot.js
const axios = require('axios');

const NGROK_URL = 'https://abd3c260797c.ngrok.app'; // Actualiza con tu URL
const AUTHORIZED_NUMBER = '3183351733'; // SIN 57

async function testVehicleBot() {
  console.log('🚗 PRUEBA DEL BOT DE CONCESIONARIO');
  console.log('=' .repeat(60));
  
  try {
    // 1. Verificar sistema
    console.log('🏥 1. Verificando sistema...');
    const health = await axios.get(`${NGROK_URL}/health`);
    console.log('✅ Sistema OK:', {
      status: health.data.status,
      redis: health.data.services.database.redis,
      inventario: health.data.services.inventory.loaded,
      totalVehiculos: health.data.services.inventory.totalVehicles,
      email: health.data.services.email.ready,
      claude: health.data.services.claude.ready,
      numeroAutorizado: health.data.authorizedNumbers
    });
    
    // 2. Verificar inventario
    console.log('\n🚗 2. Verificando inventario...');
    const inventory = await axios.get(`${NGROK_URL}/inventory`);
    console.log('✅ Inventario cargado:', {
      totalVehiculos: inventory.data.total,
      marcas: inventory.data.brands,
      primeros5Vehiculos: inventory.data.vehicles.slice(0, 5)
    });
    
    // 3. Limpiar datos anteriores
    console.log('\n🧹 3. Limpiando datos anteriores...');
    try {
      await axios.delete(`${NGROK_URL}/admin/clear-data/57${AUTHORIZED_NUMBER}`);
      console.log('✅ Datos anteriores limpiados');
    } catch (e) {
      console.log('ℹ️ No había datos anteriores');
    }
    
    // 4. Iniciar conversación
    console.log('\n🚀 4. Iniciando conversación...');
    const startResponse = await axios.post(`${NGROK_URL}/start-conversation`, {
      phoneNumber: AUTHORIZED_NUMBER
    });
    
    console.log('✅ Conversación iniciada:', {
      success: startResponse.data.success,
      leadId: startResponse.data.leadId,
      phoneNumber: startResponse.data.phoneNumber,
      authorized: startResponse.data.authorized
    });
    
    // 5. Verificar lead creado
    console.log('\n🔍 5. Verificando lead creado...');
    const fullNumber = `57${AUTHORIZED_NUMBER}`;
    
    const leadCheck = await axios.get(`${NGROK_URL}/lead/${fullNumber}`);
    console.log('✅ Lead encontrado:', {
      id: leadCheck.data.id,
      telefono: leadCheck.data.cliente.celular,
      status: leadCheck.data.proceso.status,
      stepActual: leadCheck.data.currentStep,
      autorizado: leadCheck.data.authorized
    });
    
    // 6. Verificar leads generales
    console.log('\n📊 6. Verificando leads...');
    const allLeads = await axios.get(`${NGROK_URL}/leads`);
    console.log('📋 Total leads:', {
      total: allLeads.data.total,
      autorizados: allLeads.data.authorizedLeads,
      activos: allLeads.data.activeLeads
    });
    
    // 7. Instrucciones para WhatsApp
    console.log('\n📱 7. ¡PRUEBA EN WHATSAPP!');
    console.log('=' .repeat(60));
    console.log(`📞 Tu número: ${fullNumber}`);
    console.log('🎯 Ya recibiste el mensaje inicial del bot');
    console.log('✅ El bot está listo para consultas de vehículos');
    
    console.log('\n🔄 SECUENCIA DE PRUEBA SUGERIDA:');
    console.log('1️⃣  "Estoy buscando un Toyota"');
    console.log('2️⃣  "¿Qué SUV tienen disponibles?"');
    console.log('3️⃣  "Mi presupuesto es de 50 millones"');
    console.log('4️⃣  "Me interesa el [Referencia_Vehiculo]"');
    console.log('5️⃣  "Quiero agendar una cita para verlo"');
    console.log('6️⃣  "Mañana por la tarde"');
    console.log('7️⃣  "A las 3 PM"');
    console.log('8️⃣  "Sí, confirmo la cita"');
    
    console.log('\n💡 CARACTERÍSTICAS DEL BOT:');
    console.log('🚗 Consulta inventario en tiempo real desde Google Sheets');
    console.log('🤖 Conversaciones naturales con Claude AI');
    console.log('🔍 Búsqueda inteligente por marca, modelo, tipo');
    console.log('📅 Agendamiento de citas para ver vehículos');
    console.log('📧 Notificaciones automáticas por email');
    console.log('📊 Registro de leads en Google Sheets');
    
    // 8. Monitoreo automático
    console.log('\n📊 8. MONITOREO AUTOMÁTICO INICIADO...');
    console.log('Presiona Ctrl+C para detener');
    
    let checkCount = 0;
    const monitor = setInterval(async () => {
      checkCount++;
      try {
        const currentLead = await axios.get(`${NGROK_URL}/lead/${fullNumber}`);
        
        console.log(`\n📈 Monitor #${checkCount} - ${new Date().toLocaleTimeString()}`);
        console.log(`🏠 Status: ${currentLead.data.proceso.status}`);
        console.log(`🎯 Paso actual: ${currentLead.data.currentStep}`);
        console.log(`🚗 Marca de interés: ${currentLead.data.interes.marca_interes || 'No especificado'}`);
        console.log(`🔍 Vehículos consultados: ${currentLead.data.vehiculosInteres?.length || 0}`);
        
        if (currentLead.data.proceso.fecha_cita) {
          console.log(`📅 Cita agendada: ${new Date(currentLead.data.proceso.fecha_cita).toLocaleDateString()} ${currentLead.data.proceso.hora_cita || ''}`);
        }
        
        if (currentLead.data.proceso.status === 'cita_agendada') {
          console.log('\n🎉 ¡CITA AGENDADA EXITOSAMENTE!');
          console.log('🏆 El bot funcionó perfectamente');
          console.log('📧 Email de notificación enviado');
          clearInterval(monitor);
        }
        
        if (checkCount >= 24) { // 4 minutos
          clearInterval(monitor);
          console.log('\n⏰ Monitoreo finalizado - continúa probando manualmente');
          console.log('\n🔗 URLs útiles para monitoreo:');
          console.log(`📊 Leads: ${NGROK_URL}/leads`);
          console.log(`🚗 Inventario: ${NGROK_URL}/inventory`);
          console.log(`🏥 Health: ${NGROK_URL}/health`);
          console.log(`📋 Lead específico: ${NGROK_URL}/lead/${fullNumber}`);
        }
      } catch (error) {
        console.log(`❌ Error en monitor: ${error.message}`);
      }
    }, 10000); // Cada 10 segundos
    
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 Verifica que el servidor esté corriendo en puerto 3000');
    }
    
    if (error.response?.status === 403) {
      console.log('🚫 Número no autorizado - verifica la configuración');
    }
    
    if (error.response?.status === 500) {
      console.log('🔥 Error interno del servidor - revisa los logs');
    }
  }
}

console.log('🚗 INICIANDO PRUEBA DEL BOT DE CONCESIONARIO...');
console.log(`🌐 URL: ${NGROK_URL}`);
console.log(`📱 Número: 57${AUTHORIZED_NUMBER}`);
console.log('✨ Bot para compra-venta de vehículos con inventario en Google Sheets');
console.log('');

testVehicleBot();