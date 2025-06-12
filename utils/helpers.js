// utils/helpers.js

function formatPhoneNumber(phone) {
    // Limpiar el número y asegurar formato correcto
    let cleanPhone = phone.replace(/[^\d]/g, '');
    
    // Remover el @c.us si está presente
    if (phone.includes('@c.us')) {
      cleanPhone = phone.split('@')[0].replace(/[^\d]/g, '');
    }
    
    // Si ya tiene 57 al inicio, mantenerlo
    if (cleanPhone.startsWith('57')) {
      return cleanPhone;
    }
    
    // Si empieza con 3 (número colombiano), agregar 57
    if (cleanPhone.startsWith('3')) {
      return '57' + cleanPhone;
    }
    
    // Para otros casos, agregar 57
    return '57' + cleanPhone;
  }
  
  function generateVehicleId() {
    return `LEAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  function logConversation(phoneNumber, message, type = 'user') {
    const timestamp = new Date().toISOString();
    const emoji = type === 'user' ? '📱' : '🤖';
    const typeLabel = type.toUpperCase();
    
    console.log(`[${timestamp}] ${emoji} ${typeLabel} ${phoneNumber}: ${message}`);
  }
  
  function sanitizeMessage(message) {
    return message
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
  }
  
  function validatePhoneNumber(phone) {
    const cleanPhone = formatPhoneNumber(phone);
    
    if (cleanPhone.startsWith('57') && cleanPhone.length >= 12 && cleanPhone.length <= 13) {
      return true;
    }
    
    return false;
  }
  
  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
   }
   
   function extractNumbers(text) {
    const numbers = text.match(/\d+/g);
    return numbers ? numbers.map(n => parseInt(n)) : [];
   }
   
   function isQuestion(message) {
    const questionIndicators = [
      '?', 'qué', 'cuál', 'cómo', 'cuándo', 'dónde', 'por qué', 
      'cuenta como', 'se considera', 'puedo', 'debo', 'tengo que',
      'cuánto', 'cuántos', 'hay', 'tienen', 'disponible'
    ];
    
    const lowerMessage = message.toLowerCase();
    return questionIndicators.some(indicator => lowerMessage.includes(indicator));
   }
   
   function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
   }
   
   function formatTimestamp(date) {
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Bogota'
    }).format(date);
   }
   
   function extractVehicleBrands(text) {
    const commonBrands = [
      'toyota', 'chevrolet', 'nissan', 'hyundai', 'kia', 'mazda',
      'volkswagen', 'ford', 'honda', 'suzuki', 'mitsubishi',
      'renault', 'peugeot', 'bmw', 'mercedes', 'audi', 'jeep'
    ];
    
    const lowerText = text.toLowerCase();
    return commonBrands.filter(brand => lowerText.includes(brand));
   }
   
   function extractVehicleTypes(text) {
    const vehicleTypes = [
      'sedan', 'suv', 'camioneta', 'hatchback', 'coupe', 'convertible',
      'pickup', 'van', 'crossover', 'deportivo', 'familiar'
    ];
    
    const lowerText = text.toLowerCase();
    return vehicleTypes.filter(type => lowerText.includes(type));
   }
   
   function parseDate(dateString) {
    // Intentar parsear fechas en español
    const lowerDate = dateString.toLowerCase();
    
    // Días de la semana
    const dayMap = {
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
    };
    
    // Buscar día de la semana
    for (const [day, dayNum] of Object.entries(dayMap)) {
      if (lowerDate.includes(day)) {
        const today = new Date();
        const currentDay = today.getDay();
        let daysUntil = dayNum - currentDay;
        
        if (daysUntil <= 0) {
          daysUntil += 7; // Próxima semana
        }
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysUntil);
        return targetDate;
      }
    }
    
    // Buscar "mañana"
    if (lowerDate.includes('mañana')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Buscar "hoy"
    if (lowerDate.includes('hoy')) {
      return new Date();
    }
    
    return null;
   }
   
   function parseTime(timeString) {
    const lowerTime = timeString.toLowerCase();
    
    // Buscar patrones de hora
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(\d{1,2})\s*(am|pm)/i,
      /(\d{1,2})\s*de\s*la\s*(mañana|tarde|noche)/i
    ];
    
    for (const pattern of timePatterns) {
      const match = timeString.match(pattern);
      if (match) {
        let hour = parseInt(match[1]);
        const minute = match[2] ? parseInt(match[2]) : 0;
        const modifier = match[3] || match[4];
        
        if (modifier) {
          if ((modifier.includes('pm') || modifier.includes('tarde') || modifier.includes('noche')) && hour < 12) {
            hour += 12;
          } else if ((modifier.includes('am') || modifier.includes('mañana')) && hour === 12) {
            hour = 0;
          }
        }
        
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }
    
    return null;
   }
   
   function generateRandomId(prefix = '', length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
   }
   
   function normalizeText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .trim();
   }
   
   function retryOperation(operation, maxRetries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      function attempt() {
        attempts++;
        
        operation()
          .then(resolve)
          .catch(error => {
            if (attempts >= maxRetries) {
              reject(error);
            } else {
              console.log(`Reintentando operación (${attempts}/${maxRetries})...`);
              setTimeout(attempt, delay);
            }
          });
      }
      
      attempt();
    });
   }
   
   module.exports = {
    formatPhoneNumber,
    generateVehicleId,
    logConversation,
    sanitizeMessage,
    validatePhoneNumber,
    formatCurrency,
    extractNumbers,
    isQuestion,
    sleep,
    formatTimestamp,
    extractVehicleBrands,
    extractVehicleTypes,
    parseDate,
    parseTime,
    generateRandomId,
    normalizeText,
    retryOperation
   };