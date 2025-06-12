const axios = require('axios');
const { logConversation } = require('../utils/helpers');

class ImageService {
  constructor() {
    this.ultramsgToken = process.env.ULTRAMSG_TOKEN;
    this.instanceId = process.env.ULTRAMSG_INSTANCE_ID;
    this.baseUrl = `https://api.ultramsg.com/${this.instanceId}`;
  }

  async sendVehicleImage(phoneNumber, imageUrl, caption = '') {
    try {
      console.log(`📸 Enviando imagen a ${phoneNumber}: ${imageUrl}`);
      
      const payload = new URLSearchParams({
        token: this.ultramsgToken,
        to: phoneNumber,
        image: imageUrl,
        caption: caption
      });

      const response = await axios.post(
        `${this.baseUrl}/messages/image`,
        payload.toString(),
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      console.log(`✅ Imagen enviada exitosamente a ${phoneNumber}`);
      logConversation(phoneNumber, `[IMAGEN] ${caption || 'Imagen del vehículo'}`, 'bot');
      
      return {
        success: true,
        response: response.data
      };

    } catch (error) {
      console.error('❌ Error enviando imagen:', error.response?.data || error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendVehicleImages(phoneNumber, vehicle, maxImages = 3) {
    try {
      if (!vehicle.ImagenesArray || vehicle.ImagenesArray.length === 0) {
        return {
          success: false,
          error: 'No hay imágenes disponibles para este vehículo'
        };
      }

      console.log(`📸 Enviando ${Math.min(maxImages, vehicle.ImagenesArray.length)} imágenes del ${vehicle.Marca} ${vehicle.Modelo} a ${phoneNumber}`);

      const results = [];
      const imagesToSend = vehicle.ImagenesArray.slice(0, maxImages);

      for (let i = 0; i < imagesToSend.length; i++) {
        const imageUrl = imagesToSend[i];
        
        // Generar caption personalizado para cada imagen
        const caption = this.generateImageCaption(vehicle, i + 1, imagesToSend.length);
        
        const result = await this.sendVehicleImage(phoneNumber, imageUrl, caption);
        results.push(result);

        // Pequeña pausa entre imágenes para evitar spam
        if (i < imagesToSend.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const successfulSends = results.filter(r => r.success).length;
      
      return {
        success: successfulSends > 0,
        totalSent: successfulSends,
        totalImages: imagesToSend.length,
        results: results
      };

    } catch (error) {
      console.error('❌ Error enviando imágenes del vehículo:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateImageCaption(vehicle, imageNumber, totalImages) {
    const baseCaption = `${vehicle.Marca} ${vehicle.Modelo}`;
    let caption = `📸 ${baseCaption}`;
    
    if (vehicle.Año) {
      caption += ` ${vehicle.Año}`;
    }
    
    // Agregar información relevante según el número de imagen
    if (imageNumber === 1) {
      caption += ' - Vista exterior';
      if (vehicle.Color) {
        caption += ` (Color ${vehicle.Color})`;
      }
    } else if (imageNumber === 2) {
      caption += ' - Interior';
      if (vehicle.Transmision) {
        caption += ` (${vehicle.Transmision})`;
      }
    } else if (imageNumber === 3) {
      caption += ' - Motor';
      if (vehicle.Cilindraje) {
        caption += ` (${vehicle.Cilindraje})`;
      }
    }
    
    // Agregar referencia y precio si está disponible
    if (vehicle.Referencia_Vehiculo) {
      caption += `\n🏷️ Ref: ${vehicle.Referencia_Vehiculo}`;
    }
    
    if (vehicle.Precio) {
      caption += `\n💰 $${vehicle.Precio}`;
    }
    
    if (vehicle.Ubicacion) {
      caption += `\n📍 ${vehicle.Ubicacion}`;
    }
    
    caption += `\n\n(${imageNumber}/${totalImages})`;
    
    return caption;
  }

  async testImageSend(phoneNumber, testImageUrl = null) {
    try {
      const defaultTestImage = 'https://storage.googleapis.com/cluvi/Autos-ST/Vehicle_Images/pilot_out.jpg';
      const imageUrl = testImageUrl || defaultTestImage;
      
      const testCaption = '🧪 Imagen de prueba del sistema de concesionario\n📸 Prueba de envío de imágenes de vehículos';
      
      return await this.sendVehicleImage(phoneNumber, imageUrl, testCaption);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  validateImageUrl(url) {
    try {
      const urlObj = new URL(url);
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const hasValidExtension = validExtensions.some(ext => 
        urlObj.pathname.toLowerCase().endsWith(ext)
      );
      
      return {
        valid: hasValidExtension,
        protocol: urlObj.protocol,
        host: urlObj.host
      };
    } catch (error) {
      return {
        valid: false,
        error: 'URL inválida'
      };
    }
  }

  async validateImageUrls(imageUrls) {
    const results = [];
    
    for (const url of imageUrls) {
      const validation = this.validateImageUrl(url);
      results.push({
        url: url,
        valid: validation.valid,
        error: validation.error
      });
    }
    
    return results;
  }
}

module.exports = { ImageService };